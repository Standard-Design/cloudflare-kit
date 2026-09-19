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

export type CacheLookup<Value> = { hit: false } | { hit: true; value: Value }

export interface KvCacheOptions {
	defaultTtlSeconds?: number
	prefix?: string
}

export interface KvCacheReadOptions<Value> {
	parse?: Parser<Value>
}

export interface KvCacheWriteOptions<Metadata extends JsonObject = JsonObject> {
	metadata?: Metadata
	ttlSeconds?: number
}

export interface KvCacheGetOrSetOptions<
	Value,
	Metadata extends JsonObject = JsonObject,
>
	extends KvCacheReadOptions<Value>, KvCacheWriteOptions<Metadata> {
	bypass?: boolean
}

export interface KvCache {
	delete(key: string): Promise<void>
	get<Value extends JsonValue = JsonValue>(
		key: string,
		options?: KvCacheReadOptions<Value>,
	): Promise<CacheLookup<Value>>
	getOrSet<Value extends JsonValue, Metadata extends JsonObject = JsonObject>(
		key: string,
		loader: () => MaybePromise<Value>,
		options?: KvCacheGetOrSetOptions<Value, Metadata>,
	): Promise<Value>
	key(key: string): string
	readonly namespace: KvNamespaceLike
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
