import { createHttpCacheKeyFactory } from './cache-key.js'
import type { HttpCachePolicy, ResolvedHttpCachePolicy } from './types.js'

const DEFAULT_CACHEABLE_METHODS = ['GET']
const DEFAULT_CACHEABLE_STATUSES = [200]
const DEFAULT_REQUEST_BLOCKERS = ['no-cache', 'no-store']
const DEFAULT_RESPONSE_BLOCKERS = ['no-store', 'private']

function lowercaseSet(values: readonly string[]): ReadonlySet<string> {
	return new Set(values.map((value) => value.toLowerCase()))
}

export function resolveHttpCachePolicy(
	policy: HttpCachePolicy = {},
): ResolvedHttpCachePolicy {
	const defaultTtlSeconds = policy.defaultTtlSeconds ?? 300
	if (!Number.isSafeInteger(defaultTtlSeconds) || defaultTtlSeconds < 0) {
		throw new TypeError(
			'HTTP cache default TTL must be a non-negative safe integer.',
		)
	}

	return {
		allowedVaryHeaders: lowercaseSet(policy.allowedVaryHeaders ?? []),
		bypassReadOnRequestNoCache: policy.bypassReadOnRequestNoCache ?? true,
		cacheableMethods: new Set(
			(policy.cacheableMethods ?? DEFAULT_CACHEABLE_METHODS).map((method) =>
				method.toUpperCase(),
			),
		),
		cacheableStatuses: new Set(
			policy.cacheableStatuses ?? DEFAULT_CACHEABLE_STATUSES,
		),
		createCacheKey:
			policy.createCacheKey ??
			createHttpCacheKeyFactory(policy.stripQueryParameters),
		defaultTtlSeconds,
		skipIfRequestCacheControlHas: lowercaseSet(
			policy.skipIfRequestCacheControlHas ?? DEFAULT_REQUEST_BLOCKERS,
		),
		skipIfResponseCacheControlHas: lowercaseSet(
			policy.skipIfResponseCacheControlHas ?? DEFAULT_RESPONSE_BLOCKERS,
		),
		skipRequestWithAuthorization: policy.skipRequestWithAuthorization ?? true,
		skipRequestWithCookie: policy.skipRequestWithCookie ?? true,
		skipRequestWithRange: policy.skipRequestWithRange ?? true,
		skipResponseWithSetCookie: policy.skipResponseWithSetCookie ?? true,
	}
}
