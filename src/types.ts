/** Shared JSON and parser contracts. Runtime validation remains app-owned. @see docs/kv-cache.md */

/** JSON scalar type; callers must still avoid non-finite numbers at runtime. */
export type JsonPrimitive = boolean | null | number | string

/** JSON-compatible data; no Date, undefined, BigInt, functions, or cyclic objects. */
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]

/** String-keyed JSON record, also used for KV metadata. */
export interface JsonObject {
	[key: string]: JsonValue
}

/** Allows synchronous or asynchronous loaders/response handlers. */
export type MaybePromise<Value> = Promise<Value> | Value

/** Synchronous validator/transformer; return a value or throw. No schema library required. */
export type Parser<Value> = (value: unknown) => Value
