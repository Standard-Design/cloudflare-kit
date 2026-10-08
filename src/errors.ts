/** Package errors are not HTTP responses and are not automatically redacted. @see docs/troubleshooting.md */

/** Base class for kit-specific errors; native/parser/storage errors may have other types. */
export class CloudflareKitError extends Error {
	override name = 'CloudflareKitError'
}

/** Required binding is undefined; the message contains its name, not its value. */
export class MissingBindingError extends CloudflareKitError {
	override name = 'MissingBindingError'

	constructor(key: PropertyKey) {
		super(`Required Cloudflare binding is missing: ${String(key)}`)
	}
}

/** No active scope, or a requested capability (such as request) was not supplied. */
export class CloudflareKitContextError extends CloudflareKitError {
	override name = 'CloudflareKitContextError'

	constructor(capability?: string) {
		super(
			capability
				? `Cloudflare Kit ${capability} is unavailable outside an active runWithCloudflareKit() scope.`
				: 'Cloudflare Kit context is unavailable outside an active runWithCloudflareKit() scope.',
		)
	}
}

/** KV TTL is not an integer >= 60 seconds; HTTP fallback TTL uses different rules. */
export class InvalidTtlError extends CloudflareKitError {
	override name = 'InvalidTtlError'

	constructor(ttl: number) {
		super(
			`Cloudflare KV expiration TTL must be an integer of at least 60 seconds; received ${String(ttl)}.`,
		)
	}
}

/** KV value is not a supported cache envelope; the message contains its physical key. */
export class InvalidCacheEntryError extends CloudflareKitError {
	override name = 'InvalidCacheEntryError'

	constructor(key: string) {
		super(`Cached value could not be decoded: ${key}`)
	}
}
