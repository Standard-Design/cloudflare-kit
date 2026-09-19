export type JsonPrimitive = boolean | null | number | string

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]

export interface JsonObject {
	[key: string]: JsonValue
}

export type MaybePromise<Value> = Promise<Value> | Value

export type Parser<Value> = (value: unknown) => Value
