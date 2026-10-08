/** Explicit boundaries between the response handler, cache backend, and execution lifetime. @see docs/http-cache.md */
import type { MaybePromise } from '../types.js'

/** One Cache API object (such as caches.default), not the global caches collection. */
export interface CacheStorageLike {
	/** Removes one key from this cache; the backing implementation defines locality. */
	delete(request: Request | string): Promise<boolean>
	/** Returns a stored response or undefined; errors propagate through the wrapper. */
	match(request: Request | string): Promise<Response | undefined>
	/** Stores the response body/headers; its promise is registered with waitUntil. */
	put(request: Request | string, response: Response): Promise<void>
}

/** Execution lifetime capability; doubles should retain promises for tests to await. */
export interface WaitUntilContext {
	/** Registers already-started work. This contract adds no catch, retry, or durable queue. */
	waitUntil(promise: Promise<unknown>): void
}

/**
 * Synchronous key producer, called even on bypass. Must encode all relevant variants.
 * URL output is converted to a string before cache access; thrown errors propagate.
 */
export type CacheKeyFactory = (request: Request) => Request | string | URL

/** Response-cache eligibility and key policy; supplied lists replace defaults. */
export interface HttpCachePolicy {
	/** Default []; write allowlist only, not key variation. Vary: * is always rejected. */
	allowedVaryHeaders?: readonly string[]
	/** Default true; false permits reads despite request blockers, but not writes. */
	bypassReadOnRequestNoCache?: boolean
	/** Default ['GET']; widening requires key design (default key method is always GET). */
	cacheableMethods?: readonly string[]
	/** Default [200]; governs new writes, not returned cache-hit status. */
	cacheableStatuses?: readonly number[]
	/** Replaces default normalization, including stripQueryParameters behavior. */
	createCacheKey?: CacheKeyFactory
	/** Default 300; non-negative safe integer. Zero prevents fallback writes, not reads. */
	defaultTtlSeconds?: number
	/** Default ['no-cache', 'no-store']; names blocking writes and normally reads. */
	skipIfRequestCacheControlHas?: readonly string[]
	/** Default ['no-store', 'private']; response no-cache is not rejected by default. */
	skipIfResponseCacheControlHas?: readonly string[]
	/** Default true; bypasses reads/writes for nonempty trimmed Authorization. */
	skipRequestWithAuthorization?: boolean
	/** Default true; bypasses every nonempty trimmed Cookie, including analytics cookies. */
	skipRequestWithCookie?: boolean
	/** Default true; bypasses reads/writes whenever Range is present. */
	skipRequestWithRange?: boolean
	/** Default true; blocks writes when Set-Cookie is present. */
	skipResponseWithSetCookie?: boolean
	/**
	 * Default utm_*, fbclid, gclid, msclkid patterns. Replaces that list; [] strips none.
	 * Strings match names case-insensitively; keep any parameters that change content.
	 */
	stripQueryParameters?: readonly (RegExp | string)[]
}

/**
 * Policy with defaults applied; names/methods normalized into read-only typed sets.
 * ReadonlySet is not a runtime freeze. See HttpCachePolicy for each option's meaning.
 */
export interface ResolvedHttpCachePolicy {
	allowedVaryHeaders: ReadonlySet<string>
	bypassReadOnRequestNoCache: boolean
	cacheableMethods: ReadonlySet<string>
	cacheableStatuses: ReadonlySet<number>
	createCacheKey: CacheKeyFactory
	defaultTtlSeconds: number
	skipIfRequestCacheControlHas: ReadonlySet<string>
	skipIfResponseCacheControlHas: ReadonlySet<string>
	skipRequestWithAuthorization: boolean
	skipRequestWithCookie: boolean
	skipRequestWithRange: boolean
	skipResponseWithSetCookie: boolean
}

/** Inputs for one response-cache operation. No resources are discovered implicitly. */
export interface WithHttpCacheOptions {
	/** Caller-selected cache backend; independent of any KV binding. */
	cache: CacheStorageLike
	/** Receives the asynchronous cache-write promise; supplied automatically by kit method. */
	context: WaitUntilContext
	/** Runs once on a miss/bypass and never on a hit; must return a Response. */
	handler: () => MaybePromise<Response>
	/** Overrides conservative defaults; authentication/preview routing remains app-owned. */
	policy?: HttpCachePolicy
	/** Original incoming request used for guards and key creation. */
	request: Request
}

/** Deletion must use the same cache and key policy as the corresponding read/write. */
export interface DeleteHttpCacheEntryOptions {
	/** Cache to delete from; the Workers Cache API only deletes locally. */
	cache: CacheStorageLike
	/** Used for key generation, not read/write eligibility guards. */
	policy?: HttpCachePolicy
	/** Request identifying one normalized key, including any variant dimensions. */
	request: Request
}
