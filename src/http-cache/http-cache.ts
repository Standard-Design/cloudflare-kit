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

	const cachedResponse = response.clone()
	const headers = new Headers(cachedResponse.headers)
	headers.set('Cache-Control', `public, s-maxage=${String(ttlSeconds)}`)
	return new Response(cachedResponse.body, {
		headers,
		status: cachedResponse.status,
		statusText: cachedResponse.statusText,
	})
}

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
		if (cachedResponse) return cachedResponse
	}

	const response = await handler()
	if (!shouldWriteHttpCache(request, response, policy)) return response

	const responseForCache = prepareResponseForCache(
		response,
		policy.defaultTtlSeconds,
	)
	if (!responseForCache) return response

	context.waitUntil(cache.put(resolvedCacheKey, responseForCache))
	return response
}

export async function deleteHttpCacheEntry({
	cache,
	policy: inputPolicy,
	request,
}: DeleteHttpCacheEntryOptions): Promise<boolean> {
	const policy = resolveHttpCachePolicy(inputPolicy)
	const cacheKey = policy.createCacheKey(request)
	return cache.delete(cacheKey instanceof URL ? cacheKey.toString() : cacheKey)
}
