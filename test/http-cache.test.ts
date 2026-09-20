import { describe, expect, it, vi } from 'vitest'

import {
	createHttpCacheKeyFactory,
	deleteHttpCacheEntry,
	withHttpCache,
	type CacheStorageLike,
} from '../src/index.js'

interface CacheDouble extends CacheStorageLike {
	delete: ReturnType<typeof vi.fn<CacheStorageLike['delete']>>
	match: ReturnType<typeof vi.fn<CacheStorageLike['match']>>
	put: ReturnType<typeof vi.fn<CacheStorageLike['put']>>
}

function createCacheDouble(hit?: Response): CacheDouble {
	return {
		delete: vi.fn(() => Promise.resolve(true)),
		match: vi.fn(() => Promise.resolve(hit)),
		put: vi.fn(() => Promise.resolve()),
	}
}

function createExecutionContextDouble() {
	const pending: Promise<unknown>[] = []
	return {
		context: {
			waitUntil(promise: Promise<unknown>) {
				pending.push(promise)
			},
		},
		pending,
	}
}

describe('HTTP cache key generation', () => {
	it('strips tracking parameters and sorts the remaining query', () => {
		const createKey = createHttpCacheKeyFactory()
		const key = createKey(
			new Request(
				'https://example.com/page?z=2&utm_source=test&a=1&fbclid=abc',
			),
		)

		expect(key).toBeInstanceOf(Request)
		expect((key as Request).url).toBe('https://example.com/page?a=1&z=2')
	})

	it('handles stateful regular expressions deterministically', () => {
		const createKey = createHttpCacheKeyFactory([/^track$/gi])

		expect(
			(createKey(new Request('https://example.com/?track=1')) as Request).url,
		).toBe('https://example.com/')
		expect(
			(createKey(new Request('https://example.com/?track=1')) as Request).url,
		).toBe('https://example.com/')
	})
})

describe('withHttpCache', () => {
	it('returns a cache hit without invoking the handler', async () => {
		const cache = createCacheDouble(new Response('cached'))
		const handler = vi.fn(() => Promise.resolve(new Response('origin')))
		const { context } = createExecutionContextDouble()

		const response = await withHttpCache({
			cache,
			context,
			handler,
			request: new Request('https://example.com/'),
		})

		expect(await response.text()).toBe('cached')
		expect(handler).not.toHaveBeenCalled()
	})

	it('streams the origin response and schedules an independent cache clone', async () => {
		const cache = createCacheDouble()
		const { context, pending } = createExecutionContextDouble()
		const response = await withHttpCache({
			cache,
			context,
			handler: () => new Response('origin'),
			request: new Request('https://example.com/'),
		})

		await Promise.all(pending)
		expect(await response.text()).toBe('origin')
		expect(cache.put).toHaveBeenCalledOnce()
		const cachedResponse = cache.put.mock.calls[0]?.[1]
		expect(cachedResponse?.headers.get('Cache-Control')).toBe(
			'public, s-maxage=300',
		)
		expect(await cachedResponse?.text()).toBe('origin')
	})

	it.each([
		['POST request', new Request('https://example.com/', { method: 'POST' })],
		[
			'authorized request',
			new Request('https://example.com/', {
				headers: { Authorization: 'Bearer secret' },
			}),
		],
		[
			'cookie-bearing request',
			new Request('https://example.com/', {
				headers: { Cookie: 'preview=true' },
			}),
		],
		[
			'range request',
			new Request('https://example.com/', {
				headers: { Range: 'bytes=0-10' },
			}),
		],
		[
			'no-store request',
			new Request('https://example.com/', {
				headers: { 'Cache-Control': 'no-store' },
			}),
		],
	] as const)('bypasses reads and writes for a %s', async (_, request) => {
		const cache = createCacheDouble()
		const { context } = createExecutionContextDouble()

		await withHttpCache({
			cache,
			context,
			handler: () => new Response('origin'),
			request,
		})

		expect(cache.match).not.toHaveBeenCalled()
		expect(cache.put).not.toHaveBeenCalled()
	})

	it.each([
		[
			'Set-Cookie',
			new Response('origin', { headers: { 'Set-Cookie': 'a=b' } }),
		],
		[
			'private',
			new Response('origin', { headers: { 'Cache-Control': 'private' } }),
		],
		['Vary wildcard', new Response('origin', { headers: { Vary: '*' } })],
		[
			'unapproved Vary',
			new Response('origin', { headers: { Vary: 'Accept' } }),
		],
		['server error', new Response('origin', { status: 500 })],
		['rate limit', new Response('origin', { status: 429 })],
		['not found', new Response('origin', { status: 404 })],
	] as const)('does not cache a response with %s', async (_, origin) => {
		const cache = createCacheDouble()
		const { context } = createExecutionContextDouble()

		await withHttpCache({
			cache,
			context,
			handler: () => origin,
			request: new Request('https://example.com/'),
		})

		expect(cache.put).not.toHaveBeenCalled()
	})

	it('allows an explicitly approved Vary dimension', async () => {
		const cache = createCacheDouble()
		const { context, pending } = createExecutionContextDouble()

		await withHttpCache({
			cache,
			context,
			handler: () => new Response('avif', { headers: { Vary: 'Accept' } }),
			policy: { allowedVaryHeaders: ['accept'] },
			request: new Request('https://example.com/image', {
				headers: { Accept: 'image/avif' },
			}),
		})
		await Promise.all(pending)

		expect(cache.put).toHaveBeenCalledOnce()
		const cacheKey = cache.put.mock.calls[0]?.[0]
		expect(cacheKey).toBeInstanceOf(Request)
		expect((cacheKey as Request).headers.get('Accept')).toBe('image/avif')
	})

	it('never writes a no-store request when read bypass is disabled', async () => {
		const cache = createCacheDouble()
		const { context } = createExecutionContextDouble()

		await withHttpCache({
			cache,
			context,
			handler: () => new Response('origin'),
			policy: { bypassReadOnRequestNoCache: false },
			request: new Request('https://example.com/', {
				headers: { 'Cache-Control': 'no-store' },
			}),
		})

		expect(cache.match).toHaveBeenCalledOnce()
		expect(cache.put).not.toHaveBeenCalled()
	})

	it('respects a response s-maxage without rewriting it', async () => {
		const cache = createCacheDouble()
		const { context, pending } = createExecutionContextDouble()

		await withHttpCache({
			cache,
			context,
			handler: () =>
				new Response('origin', {
					headers: { 'Cache-Control': 'public, s-maxage=900' },
				}),
			request: new Request('https://example.com/'),
		})
		await Promise.all(pending)

		const cachedResponse = cache.put.mock.calls[0]?.[1]
		expect(cachedResponse?.headers.get('Cache-Control')).toBe(
			'public, s-maxage=900',
		)
	})

	it('does not cache a zero-TTL response', async () => {
		const cache = createCacheDouble()
		const { context } = createExecutionContextDouble()

		await withHttpCache({
			cache,
			context,
			handler: () =>
				new Response('origin', {
					headers: { 'Cache-Control': 'public, max-age=0' },
				}),
			request: new Request('https://example.com/'),
		})

		expect(cache.put).not.toHaveBeenCalled()
	})

	it('supports local cache deletion with the same normalized key', async () => {
		const cache = createCacheDouble()
		await deleteHttpCacheEntry({
			cache,
			request: new Request('https://example.com/?utm_source=test'),
		})

		expect(cache.delete).toHaveBeenCalledOnce()
		expect(cache.delete.mock.calls[0]?.[0]).toBeInstanceOf(Request)
		expect((cache.delete.mock.calls[0]?.[0] as Request).url).toBe(
			'https://example.com/',
		)
	})

	it('works with the real Workers Cache API', async () => {
		const runtimeCache: CacheStorageLike = await caches.open(
			'cloudflare-kit-tests',
		)
		const request = new Request(
			`https://example.com/runtime-${crypto.randomUUID()}`,
		)
		const firstContext = createExecutionContextDouble()

		const first = await withHttpCache({
			cache: runtimeCache,
			context: firstContext.context,
			handler: () => new Response('runtime-origin'),
			request,
		})
		await Promise.all(firstContext.pending)
		expect(await first.text()).toBe('runtime-origin')

		const handler = vi.fn(() => new Response('unexpected-origin'))
		const second = await withHttpCache({
			cache: runtimeCache,
			context: createExecutionContextDouble().context,
			handler,
			request,
		})

		expect(await second.text()).toBe('runtime-origin')
		expect(handler).not.toHaveBeenCalled()
		expect(await runtimeCache.delete(request)).toBe(true)
	})
})
