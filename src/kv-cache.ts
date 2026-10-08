/** Read-through JSON caching over KV, separate from HTTP response caching. @see docs/kv-cache.md */
import { InvalidCacheEntryError } from './errors.js'
import type { KvNamespaceLike, KvPutOptions } from './kv.js'
import { assertValidKvExpirationTtl } from './kv-ttl.js'
import type { JsonObject, JsonValue, MaybePromise, Parser } from './types.js'

const CACHE_ENTRY_VERSION = 1
const DEFAULT_PREFIX = 'cache'
const DEFAULT_TTL_SECONDS = 300

interface CacheEnvelope {
	value: unknown
	version: typeof CACHE_ENTRY_VERSION
}

/** Test hit, not value truthiness: null, false, zero, and empty string can all be hits. */
export type CacheLookup<Value> = { hit: false } | { hit: true; value: Value }

/** Per-wrapper defaults; changing them does not reconfigure existing cache entries. */
export interface KvCacheOptions {
	/** Default 300 seconds; integer >= 60, passed as KV expirationTtl on writes. */
	defaultTtlSeconds?: number
	/** Default cache; physical keys are prefix:key. Must not be empty. */
	prefix?: string
}

/** Cache-hit decoding options. */
export interface KvCacheReadOptions<Value> {
	/** Parses the envelope value, including null; exceptions propagate, never become misses. */
	parse?: Parser<Value>
}

/** Overrides for one write; metadata is not included in CacheLookup results. */
export interface KvCacheWriteOptions<Metadata extends JsonObject = JsonObject> {
	/** Optional JSON object forwarded to the underlying KV put. */
	metadata?: Metadata
	/** Uses the wrapper default if absent; integer >= 60. Zero is not a bypass value. */
	ttlSeconds?: number
}

/** Read parser plus write settings; parse is not applied to fresh loader output. */
export interface KvCacheGetOrSetOptions<
	Value,
	Metadata extends JsonObject = JsonObject,
>
	extends KvCacheReadOptions<Value>, KvCacheWriteOptions<Metadata> {
	/** Default false. True skips both reads and writes without deleting existing data. */
	bypass?: boolean
}

/** Versioned JSON cache with KV expiration, not a separate freshness clock or lock. */
export interface KvCache {
	/** Deletes one logical key after adding this wrapper's prefix. */
	delete(key: string): Promise<void>
	/** Returns hit/miss; malformed envelopes throw InvalidCacheEntryError. */
	get<Value extends JsonValue = JsonValue>(
		key: string,
		options?: KvCacheReadOptions<Value>,
	): Promise<CacheLookup<Value>>
	/**
	 * Reads, or awaits loader then write on a miss. Concurrent misses may load twice.
	 * Validate fresh output inside loader: parse runs on hits only. Write errors reject.
	 */
	getOrSet<Value extends JsonValue, Metadata extends JsonObject = JsonObject>(
		key: string,
		loader: () => MaybePromise<Value>,
		options?: KvCacheGetOrSetOptions<Value, Metadata>,
	): Promise<Value>
	/** Converts logical to physical key; do not feed its result back into get/set/delete. */
	key(key: string): string
	/** Underlying namespace; raw writes must honor the envelope if using cache keys. */
	readonly namespace: KvNamespaceLike
	/** Awaits a versioned-envelope write with KV expiration; never schedules waitUntil. */
	set<Value extends JsonValue, Metadata extends JsonObject = JsonObject>(
		key: string,
		value: Value,
		options?: KvCacheWriteOptions<Metadata>,
	): Promise<void>
}

function isCacheEnvelope(value: unknown): value is CacheEnvelope {
	return (
		typeof value === 'object' &&
		value !== null &&
		Object.hasOwn(value, 'value') &&
		'version' in value &&
		value.version === CACHE_ENTRY_VERSION
	)
}

/**
 * Creates a scoped-prefix wrapper without performing storage I/O or requiring ALS.
 * @throws InvalidTtlError for invalid default TTL, or TypeError for an empty prefix.
 */
export function createKvCache(
	namespace: KvNamespaceLike,
	options: KvCacheOptions = {},
): KvCache {
	const prefix = options.prefix ?? DEFAULT_PREFIX
	const defaultTtlSeconds = options.defaultTtlSeconds ?? DEFAULT_TTL_SECONDS

	if (prefix.length === 0) {
		throw new TypeError('KV cache prefix must not be empty.')
	}
	assertValidKvExpirationTtl(defaultTtlSeconds)

	const getKey = (key: string) => `${prefix}:${key}`

	const set: KvCache['set'] = async (key, value, writeOptions) => {
		const ttlSeconds = writeOptions?.ttlSeconds ?? defaultTtlSeconds
		assertValidKvExpirationTtl(ttlSeconds)

		const putOptions: KvPutOptions = {
			expirationTtl: ttlSeconds,
			...(writeOptions?.metadata === undefined
				? {}
				: { metadata: writeOptions.metadata }),
		}

		await namespace.put(
			getKey(key),
			JSON.stringify({ value, version: CACHE_ENTRY_VERSION }),
			putOptions,
		)
	}

	const get = async <Value extends JsonValue = JsonValue>(
		key: string,
		readOptions?: KvCacheReadOptions<Value>,
	): Promise<CacheLookup<Value>> => {
		const cacheKey = getKey(key)
		const entry = await namespace.get(cacheKey, 'json')
		// Null outside the envelope means absence; null inside it is a cacheable value.
		if (entry === null) return { hit: false }
		if (!isCacheEnvelope(entry)) throw new InvalidCacheEntryError(cacheKey)

		const value = readOptions?.parse
			? readOptions.parse(entry.value)
			: (entry.value as Value)
		return { hit: true, value }
	}

	return {
		async delete(key) {
			await namespace.delete(getKey(key))
		},
		get,
		async getOrSet(key, loader, getOrSetOptions) {
			if (!getOrSetOptions?.bypass) {
				const cached = await get(key, getOrSetOptions)
				if (cached.hit) return cached.value
			}

			// Fresh values are owned/validated by the loader. Re-parsing here could
			// apply a transforming parser twice to data already in its output shape.
			const value = await loader()
			if (!getOrSetOptions?.bypass) {
				await set(key, value, getOrSetOptions)
			}
			return value
		},
		key: getKey,
		get namespace() {
			return namespace
		},
		set,
	}
}
