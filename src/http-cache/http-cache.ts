/** Response orchestration only; applications own private-route/preview classification. @see docs/http-cache.md */
import { getCacheTtlSeconds, parseCacheControl } from './cache-control.js'
import { shouldBypassHttpCacheRead, shouldWriteHttpCache } from './guards.js'
import { resolveHttpCachePolicy } from './policy.js'
import type {
	DeleteHttpCacheEntryOptions,
	WithHttpCacheOptions,
} from './types.js'

function prepareResponseForCache(
	response: Response,
	defaultTtlSeconds: number,
): Response | null {
	const directives = parseCacheControl(response.headers.get('Cache-Control'))
	const configuredTtl = getCacheTtlSeconds(directives)
	const ttlSeconds = configuredTtl ?? defaultTtlSeconds
	if (ttlSeconds === 0) return null

	if (configuredTtl !== null) return response.clone()

	// Only the stored copy gets the fallback header; the origin response remains
	// untouched. A later hit can therefore carry different cache headers than a miss.
	const cachedResponse = response.clone()
	const headers = new Headers(cachedResponse.headers)
	headers.set('Cache-Control', `public, s-maxage=${String(ttlSeconds)}`)
	return new Response(cachedResponse.body, {
		headers,
		status: cachedResponse.status,
		statusText: cachedResponse.statusText,
	})
}

/**
 * Returns a cache hit or calls handler and schedules an eligible response clone.
 * Writes use waitUntil; KV getOrSet writes, by contrast, are awaited.
 * Read/handler/key/clone failures propagate; asynchronous put failures belong to
 * the background promise. No retry, stale fallback, or request coalescing is added.
 */
export async function withHttpCache({
	cache,
	context,
	handler,
	policy: inputPolicy,
	request,
}: WithHttpCacheOptions): Promise<Response> {
	const policy = resolveHttpCachePolicy(inputPolicy)
	const cacheKey = policy.createCacheKey(request)
	const resolvedCacheKey =
		cacheKey instanceof URL ? cacheKey.toString() : cacheKey

	if (!shouldBypassHttpCacheRead(request, policy)) {
		const cachedResponse = await cache.match(resolvedCacheKey)
		// No handler execution means new origin privacy headers cannot protect an
		// old entry. Classify private routes before entering this wrapper.
		if (cachedResponse) return cachedResponse
	}

	const response = await handler()
	if (!shouldWriteHttpCache(request, response, policy)) return response

	const responseForCache = prepareResponseForCache(
		response,
		policy.defaultTtlSeconds,
	)
	if (!responseForCache) return response

	// Clone before returning so caching can consume its own body stream. The
	// runtime owns the pending promise; this is not a durable queue or success ack.
	context.waitUntil(cache.put(resolvedCacheKey, responseForCache))
	return response
}

/** Deletes one normalized response key; no guard checks, KV eviction, or global purge. */
export async function deleteHttpCacheEntry({
	cache,
	policy: inputPolicy,
	request,
}: DeleteHttpCacheEntryOptions): Promise<boolean> {
	const policy = resolveHttpCachePolicy(inputPolicy)
	const cacheKey = policy.createCacheKey(request)
	return cache.delete(cacheKey instanceof URL ? cacheKey.toString() : cacheKey)
}
