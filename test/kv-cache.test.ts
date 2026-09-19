import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
	InvalidCacheEntryError,
	InvalidTtlError,
	createKvCache,
} from '../src/index.js'

describe('createKvCache', () => {
	beforeEach(async () => {
		const listed = await env.TEST_KV.list()
		await Promise.all(listed.keys.map((key) => env.TEST_KV.delete(key.name)))
	})

	it.each([
		['boolean false', false],
		['empty string', ''],
		['zero', 0],
		['null', null],
	] as const)('distinguishes cached %s from a miss', async (_, value) => {
		const cache = createKvCache(env.TEST_KV)
		await cache.set('falsey', value)

		await expect(cache.get('falsey')).resolves.toEqual({
			hit: true,
			value,
		})
		await expect(cache.get('missing')).resolves.toEqual({ hit: false })
	})

	it('uses an explicit prefix and default TTL', async () => {
		const cache = createKvCache(env.TEST_KV, {
			defaultTtlSeconds: 600,
			prefix: 'pages',
		})
		await cache.set('/about', { title: 'About' })

		expect(cache.key('/about')).toBe('pages:/about')
		expect(await env.TEST_KV.get('pages:/about', 'json')).toEqual({
			value: { title: 'About' },
			version: 1,
		})
	})

	it('loads once and then returns the stored value', async () => {
		const cache = createKvCache(env.TEST_KV)
		const loader = vi.fn(() => Promise.resolve({ enabled: true }))

		await expect(cache.getOrSet('settings', loader)).resolves.toEqual({
			enabled: true,
		})
		await expect(cache.getOrSet('settings', loader)).resolves.toEqual({
			enabled: true,
		})
		expect(loader).toHaveBeenCalledTimes(1)
	})

	it('bypasses both reads and writes when requested', async () => {
		const cache = createKvCache(env.TEST_KV)
		await cache.set('preview', 'published')

		await expect(
			cache.getOrSet('preview', () => 'draft', { bypass: true }),
		).resolves.toBe('draft')
		await expect(cache.get('preview')).resolves.toEqual({
			hit: true,
			value: 'published',
		})
	})

	it('rejects unsupported KV expiration TTLs before writing', () => {
		expect(() => createKvCache(env.TEST_KV, { defaultTtlSeconds: 59 })).toThrow(
			InvalidTtlError,
		)
	})

	it('rejects values that do not use the versioned cache envelope', async () => {
		await env.TEST_KV.put('cache:legacy', JSON.stringify(false))
		const cache = createKvCache(env.TEST_KV)

		await expect(cache.get('legacy')).rejects.toThrow(InvalidCacheEntryError)
	})
})
