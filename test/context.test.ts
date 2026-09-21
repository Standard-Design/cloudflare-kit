import { env as workerEnv } from 'cloudflare:workers'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
	bindings,
	cache,
	CloudflareKitContextError,
	createCloudflareKit,
	env,
	getCloudflareKit,
	kv,
	request,
	runWithCloudflareKit,
	waitUntil,
} from '../src/index.js'

declare module '../src/index.js' {
	interface CloudflareKitBindings {
		CONTENT_KV: KVNamespace
		EMPTY: string
		KV: KVNamespace
	}
}

describe('Cloudflare Kit request context', () => {
	beforeEach(async () => {
		const listed = await workerEnv.TEST_KV.list()
		await Promise.all(
			listed.keys.map((key) => workerEnv.TEST_KV.delete(key.name)),
		)
	})

	it('keeps explicit contexts independent without request-global access', () => {
		const first = createCloudflareKit({
			ctx: { waitUntil: vi.fn() },
			env: { REQUEST_ID: 'first' },
		})
		const second = createCloudflareKit({
			ctx: { waitUntil: vi.fn() },
			env: { REQUEST_ID: 'second' },
		})

		expect(first.environment.require('REQUEST_ID')).toBe('first')
		expect(second.environment.require('REQUEST_ID')).toBe('second')
	})

	it('provides the same context through scoped and global accessors', async () => {
		const workerRequest = new Request('https://example.com/path')
		const result = await runWithCloudflareKit(
			{
				ctx: { waitUntil: vi.fn() },
				env: {
					CONTENT_KV: workerEnv.TEST_KV,
					EMPTY: '',
					KV: workerEnv.TEST_KV,
				},
				request: workerRequest,
			},
			async (cloudflare) => {
				await Promise.resolve()

				expect(getCloudflareKit()).toBe(cloudflare)
				expect(bindings().EMPTY).toBe('')
				expect(env().require('EMPTY')).toBe('')
				expect(request()).toBe(workerRequest)
				return 'complete'
			},
		)

		expect(result).toBe('complete')
	})

	it('isolates concurrent asynchronous request scopes', async () => {
		const readRequestId = (requestId: string) =>
			runWithCloudflareKit(
				{
					ctx: { waitUntil: vi.fn() },
					env: { REQUEST_ID: requestId },
				},
				async () => {
					await Promise.resolve()
					return env<{ REQUEST_ID: string }>().require('REQUEST_ID')
				},
			)

		await expect(
			Promise.all([readRequestId('first'), readRequestId('second')]),
		).resolves.toEqual(['first', 'second'])
	})

	it('provides default KV and cache access from the KV binding', async () => {
		await runWithCloudflareKit(
			{
				ctx: { waitUntil: vi.fn() },
				env: {
					CONTENT_KV: workerEnv.TEST_KV,
					EMPTY: '',
					KV: workerEnv.TEST_KV,
				},
			},
			async () => {
				await kv().set('direct', { enabled: false })
				await expect(kv().get('direct')).resolves.toMatchObject({
					value: { enabled: false },
				})

				await expect(cache().getOrSet('cached', () => 0)).resolves.toBe(0)
				await expect(cache().getOrSet('cached', () => 1)).resolves.toBe(0)

				await kv('CONTENT_KV').set('content', 'secondary')
				await expect(kv('CONTENT_KV').get('content')).resolves.toMatchObject({
					value: 'secondary',
				})
				await expect(
					cache('CONTENT_KV', { prefix: 'content' }).getOrSet(
						'page',
						() => 'rendered',
					),
				).resolves.toBe('rendered')
			},
		)
	})

	it('forwards global waitUntil without losing the context receiver', () => {
		const schedule = vi.fn()
		const work = Promise.resolve()

		runWithCloudflareKit({ ctx: { waitUntil: schedule }, env: {} }, () => {
			waitUntil(work)
		})

		expect(schedule).toHaveBeenCalledWith(work)
	})

	it('fails clearly outside an active request scope', () => {
		expect(() => getCloudflareKit()).toThrow(CloudflareKitContextError)
	})
})
