import { hasAnyDirective, parseCacheControl } from './cache-control.js'
import type { ResolvedHttpCachePolicy } from './types.js'

function hasNonEmptyHeader(request: Request, name: string): boolean {
	return Boolean(request.headers.get(name)?.trim())
}

function responseVaryIsSafe(
	response: Response,
	policy: ResolvedHttpCachePolicy,
): boolean {
	const vary = response.headers.get('Vary')
	if (!vary) return true

	const fields = vary
		.split(',')
		.map((field) => field.trim().toLowerCase())
		.filter(Boolean)

	return fields.every(
		(field) => field !== '*' && policy.allowedVaryHeaders.has(field),
	)
}

function requestIsIneligible(
	request: Request,
	policy: ResolvedHttpCachePolicy,
): boolean {
	if (!policy.cacheableMethods.has(request.method.toUpperCase())) return true
	if (
		policy.skipRequestWithAuthorization &&
		hasNonEmptyHeader(request, 'Authorization')
	) {
		return true
	}
	if (policy.skipRequestWithCookie && hasNonEmptyHeader(request, 'Cookie')) {
		return true
	}
	return policy.skipRequestWithRange && request.headers.has('Range')
}

function requestHasBlockingCacheDirective(
	request: Request,
	policy: ResolvedHttpCachePolicy,
): boolean {
	if (request.headers.get('Pragma')?.toLowerCase().includes('no-cache')) {
		return true
	}

	return hasAnyDirective(
		parseCacheControl(request.headers.get('Cache-Control')),
		policy.skipIfRequestCacheControlHas,
	)
}

export function shouldBypassHttpCacheRead(
	request: Request,
	policy: ResolvedHttpCachePolicy,
): boolean {
	if (requestIsIneligible(request, policy)) return true
	if (!policy.bypassReadOnRequestNoCache) return false
	return requestHasBlockingCacheDirective(request, policy)
}

export function shouldWriteHttpCache(
	request: Request,
	response: Response,
	policy: ResolvedHttpCachePolicy,
): boolean {
	if (requestIsIneligible(request, policy)) return false
	if (requestHasBlockingCacheDirective(request, policy)) return false
	if (!policy.cacheableStatuses.has(response.status)) return false
	if (policy.skipResponseWithSetCookie && response.headers.has('Set-Cookie')) {
		return false
	}
	if (!responseVaryIsSafe(response, policy)) return false

	return !hasAnyDirective(
		parseCacheControl(response.headers.get('Cache-Control')),
		policy.skipIfResponseCacheControlHas,
	)
}
