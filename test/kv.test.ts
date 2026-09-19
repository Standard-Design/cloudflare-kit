import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

import { InvalidTtlError, createKvStore } from '../src/index.js'

describe('createKvStore', () => {
	beforeEach(async () => {
		const listed = await env.TEST_KV.list()
		await Promise.all(listed.keys.map((key) => env.TEST_KV.delete(key.name)))
	})

	it('stores JSON values and metadata through the real Workers KV binding', async () => {
		const store = createKvStore(env.TEST_KV)
		await store.set(
			'feature',
			{ enabled: false },
			{
				expirationTtl: 300,
				metadata: { source: 'test' },
			},
		)

		await expect(store.get('feature')).resolves.toEqual({
			metadata: { source: 'test' },
			value: { enabled: false },
		})
		expect(await store.has('feature')).toBe(true)
	})

	it('supports parsing data at the KV boundary', async () => {
		const store = createKvStore(env.TEST_KV)
		await store.set('count', 2)

		const result = await store.get('count', {
			parse(value) {
				if (typeof value !== 'number') throw new TypeError('Expected number')
				return value * 2
			},
		})

		expect(result.value).toBe(4)
	})

	it('rejects unsupported expiration TTLs before calling Workers KV', async () => {
		const store = createKvStore(env.TEST_KV)

		await expect(
			store.set('too-short', 'value', { expirationTtl: 59 }),
		).rejects.toThrow(InvalidTtlError)
	})
})
