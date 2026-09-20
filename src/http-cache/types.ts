import type { MaybePromise } from '../types.js'

export interface CacheStorageLike {
	delete(request: Request | string): Promise<boolean>
	match(request: Request | string): Promise<Response | undefined>
	put(request: Request | string, response: Response): Promise<void>
}

export interface WaitUntilContext {
	waitUntil(promise: Promise<unknown>): void
}

export type CacheKeyFactory = (request: Request) => Request | string | URL

export interface HttpCachePolicy {
	allowedVaryHeaders?: readonly string[]
	bypassReadOnRequestNoCache?: boolean
	cacheableMethods?: readonly string[]
	cacheableStatuses?: readonly number[]
	createCacheKey?: CacheKeyFactory
	defaultTtlSeconds?: number
	skipIfRequestCacheControlHas?: readonly string[]
	skipIfResponseCacheControlHas?: readonly string[]
	skipRequestWithAuthorization?: boolean
	skipRequestWithCookie?: boolean
	skipRequestWithRange?: boolean
	skipResponseWithSetCookie?: boolean
	stripQueryParameters?: readonly (RegExp | string)[]
}

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

export interface WithHttpCacheOptions {
	cache: CacheStorageLike
	context: WaitUntilContext
	handler: () => MaybePromise<Response>
	policy?: HttpCachePolicy
	request: Request
}

export interface DeleteHttpCacheEntryOptions {
	cache: CacheStorageLike
	policy?: HttpCachePolicy
	request: Request
}
