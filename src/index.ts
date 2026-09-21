// Consumers can merge their generated Worker Env into this interface once so
// the request-global accessors remain typed throughout the application.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface CloudflareKitBindings {}

export {
	CloudflareKitContextError,
	CloudflareKitError,
	InvalidCacheEntryError,
	InvalidTtlError,
	MissingBindingError,
} from './errors.js'
export {
	bindings,
	cache,
	createCloudflareKit,
	env,
	getCloudflareKit,
	kv,
	request,
	runWithCloudflareKit,
	waitUntil,
	type CloudflareKitCallback,
	type CloudflareKitContext,
	type CreateCloudflareKitOptions,
	type KvBindingKey,
} from './context.js'
export { createEnvironment, type EnvironmentReader } from './env.js'
export * from './http-cache/index.js'
export {
	createKvCache,
	type CacheLookup,
	type KvCache,
	type KvCacheGetOrSetOptions,
	type KvCacheOptions,
	type KvCacheReadOptions,
	type KvCacheWriteOptions,
} from './kv-cache.js'
export {
	createKvStore,
	type KvEntry,
	type KvGetOptions,
	type KvKey,
	type KvKeyPage,
	type KvListOptions,
	type KvNamespaceLike,
	type KvNamespaceListKey,
	type KvNamespaceListResult,
	type KvPutOptions,
	type KvStore,
} from './kv.js'
export type {
	JsonObject,
	JsonPrimitive,
	JsonValue,
	MaybePromise,
	Parser,
} from './types.js'
