import type { JsonObject, JsonValue, Parser } from './types.js'
import { assertValidKvExpirationTtl } from './kv-ttl.js'

export interface KvListOptions {
	cursor?: string | null
	limit?: number
	prefix?: string | null
}

export interface KvPutOptions<Metadata extends JsonObject = JsonObject> {
	expiration?: number
	expirationTtl?: number
	metadata?: Metadata | null
}

export interface KvNamespaceListKey<Metadata = unknown> {
	expiration?: number
	metadata?: Metadata
	name: string
}

export type KvNamespaceListResult<Metadata = unknown> =
	| {
			cursor: string
			keys: KvNamespaceListKey<Metadata>[]
			list_complete: false
	  }
	| {
			keys: KvNamespaceListKey<Metadata>[]
			list_complete: true
	  }

export interface KvNamespaceLike {
	delete(key: string): Promise<void>
	get<Value = unknown>(key: string, type: 'json'): Promise<Value | null>
	get(key: string, type: 'text'): Promise<string | null>
	getWithMetadata<Value = unknown, Metadata = unknown>(
		key: string,
		type: 'json',
	): Promise<{ metadata: Metadata | null; value: Value | null }>
	list<Metadata = unknown>(
		options?: KvListOptions,
	): Promise<KvNamespaceListResult<Metadata>>
	put(key: string, value: string, options?: KvPutOptions): Promise<void>
}

export interface KvEntry<Value, Metadata> {
	metadata: Metadata | null
	value: Value | null
}

export interface KvKey<Metadata> {
	expiresAt?: number
	metadata?: Metadata
	name: string
}

export type KvKeyPage<Metadata> =
	| { cursor: null; done: true; keys: KvKey<Metadata>[] }
	| { cursor: string; done: false; keys: KvKey<Metadata>[] }

export interface KvGetOptions<Value> {
	parse?: Parser<Value>
}

export interface KvStore {
	delete(key: string): Promise<void>
	get<
		Value extends JsonValue = JsonValue,
		Metadata extends JsonObject = JsonObject,
	>(
		key: string,
		options?: KvGetOptions<Value>,
	): Promise<KvEntry<Value, Metadata>>
	has(key: string): Promise<boolean>
	list<Metadata extends JsonObject = JsonObject>(
		options?: KvListOptions,
	): Promise<KvKeyPage<Metadata>>
	readonly namespace: KvNamespaceLike
	set<Value extends JsonValue, Metadata extends JsonObject = JsonObject>(
		key: string,
		value: Value,
		options?: KvPutOptions<Metadata>,
	): Promise<void>
}

export function createKvStore(namespace: KvNamespaceLike): KvStore {
	return {
		async delete(key) {
			await namespace.delete(key)
		},
		async get<
			Value extends JsonValue = JsonValue,
			Metadata extends JsonObject = JsonObject,
		>(key: string, options?: KvGetOptions<Value>) {
			const result = await namespace.getWithMetadata<unknown, Metadata>(
				key,
				'json',
			)
			const value =
				result.value === null
					? null
					: options?.parse
						? options.parse(result.value)
						: (result.value as Value)

			return { metadata: result.metadata, value }
		},
		async has(key) {
			return (await namespace.get(key, 'text')) !== null
		},
		async list<Metadata extends JsonObject = JsonObject>(
			options?: KvListOptions,
		) {
			const result = await namespace.list<Metadata>(options)
			const keys = result.keys.map((key) => ({
				...(key.expiration === undefined ? {} : { expiresAt: key.expiration }),
				...(key.metadata === undefined ? {} : { metadata: key.metadata }),
				name: key.name,
			}))

			return result.list_complete
				? { cursor: null, done: true as const, keys }
				: { cursor: result.cursor, done: false as const, keys }
		},
		get namespace() {
			return namespace
		},
		async set<
			Value extends JsonValue,
			Metadata extends JsonObject = JsonObject,
		>(key: string, value: Value, options?: KvPutOptions<Metadata>) {
			if (options?.expirationTtl !== undefined) {
				assertValidKvExpirationTtl(options.expirationTtl)
			}
			await namespace.put(key, JSON.stringify(value), options)
		},
	}
}
