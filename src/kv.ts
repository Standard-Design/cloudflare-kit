/** JSON storage without cache envelopes or automatic prefixes. @see docs/kv.md */
import type { JsonObject, JsonValue, Parser } from './types.js'
import { assertValidKvExpirationTtl } from './kv-ttl.js'

/** One-page list arguments forwarded to the namespace. */
export interface KvListOptions {
	/** Cursor from an incomplete previous page; null/omitted starts a listing. */
	cursor?: string | null
	/** Requested page size; backing KV applies its own limits. */
	limit?: number
	/** Restricts physical key names; no prefix is added by KvStore. */
	prefix?: string | null
}

/** Write settings passed through to KV; no expiration is selected by default. */
export interface KvPutOptions<Metadata extends JsonObject = JsonObject> {
	/** Absolute expiration as Unix seconds; platform validation applies. */
	expiration?: number
	/** Relative expiration in seconds; the kit requires an integer of at least 60. */
	expirationTtl?: number
	/** JSON metadata stored alongside the value; read parsers do not validate it. */
	metadata?: Metadata | null
}

/** Raw namespace list record; expiration is Unix seconds. */
export interface KvNamespaceListKey<Metadata = unknown> {
	expiration?: number
	metadata?: Metadata
	name: string
}

/** Raw KV pagination result; use list_complete, not key count, to decide completion. */
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

/** Minimal binding shape accepted by the factories and implementable by test doubles. */
export interface KvNamespaceLike {
	/** Removes the physical key; no existence result is returned. */
	delete(key: string): Promise<void>
	/** Reads decoded JSON; stored null and missing entries are indistinguishable here. */
	get<Value = unknown>(key: string, type: 'json'): Promise<Value | null>
	/** Reads text so existence checks can distinguish stored JSON null from absence. */
	get(key: string, type: 'text'): Promise<string | null>
	/** Reads decoded JSON and separately stored metadata. */
	getWithMetadata<Value = unknown, Metadata = unknown>(
		key: string,
		type: 'json',
	): Promise<{ metadata: Metadata | null; value: Value | null }>
	/** Retrieves one page; the caller follows the cursor. */
	list<Metadata = unknown>(
		options?: KvListOptions,
	): Promise<KvNamespaceListResult<Metadata>>
	/** Writes an already serialized string. */
	put(key: string, value: string, options?: KvPutOptions): Promise<void>
}

/** Value and unparsed metadata; value null can mean either absence or stored JSON null. */
export interface KvEntry<Value, Metadata> {
	metadata: Metadata | null
	value: Value | null
}

/** Normalized list record; expiresAt uses Unix seconds, not milliseconds. */
export interface KvKey<Metadata> {
	expiresAt?: number
	metadata?: Metadata
	name: string
}

/** One page; done true carries cursor null, otherwise continue with the string cursor. */
export type KvKeyPage<Metadata> =
	| { cursor: null; done: true; keys: KvKey<Metadata>[] }
	| { cursor: string; done: false; keys: KvKey<Metadata>[] }

/** Validation of a decoded, non-null stored value. */
export interface KvGetOptions<Value> {
	/** Synchronous parser; skipped for null, may transform the value, errors propagate. */
	parse?: Parser<Value>
}

/** General JSON storage; all writes/deletes are awaited and no request guards are applied. */
export interface KvStore {
	/** Deletes the exact physical key; no automatic prefix or global consistency barrier. */
	delete(key: string): Promise<void>
	/** Returns value and metadata; generic parameters alone do not validate either. */
	get<
		Value extends JsonValue = JsonValue,
		Metadata extends JsonObject = JsonObject,
	>(
		key: string,
		options?: KvGetOptions<Value>,
	): Promise<KvEntry<Value, Metadata>>
	/** Checks text presence; a has/get sequence is not atomic. */
	has(key: string): Promise<boolean>
	/** Returns a single page with normalized expiration and completion fields. */
	list<Metadata extends JsonObject = JsonObject>(
		options?: KvListOptions,
	): Promise<KvKeyPage<Metadata>>
	/** Raw binding for capabilities outside this wrapper. */
	readonly namespace: KvNamespaceLike
	/** JSON-serializes and awaits a write; serialization and platform errors propagate. */
	set<Value extends JsonValue, Metadata extends JsonObject = JsonObject>(
		key: string,
		value: Value,
		options?: KvPutOptions<Metadata>,
	): Promise<void>
}

/** Creates a lazy JSON wrapper over a supplied namespace; does not require ALS scope. */
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
			// JSON null is a valid stored value; text distinguishes it from no entry.
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
