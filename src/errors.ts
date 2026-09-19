export class CloudflareKitError extends Error {
	override name = 'CloudflareKitError'
}

export class MissingBindingError extends CloudflareKitError {
	override name = 'MissingBindingError'

	constructor(key: PropertyKey) {
		super(`Required Cloudflare binding is missing: ${String(key)}`)
	}
}

export class InvalidTtlError extends CloudflareKitError {
	override name = 'InvalidTtlError'

	constructor(ttl: number) {
		super(
			`Cloudflare KV expiration TTL must be an integer of at least 60 seconds; received ${String(ttl)}.`,
		)
	}
}

export class InvalidCacheEntryError extends CloudflareKitError {
	override name = 'InvalidCacheEntryError'

	constructor(key: string) {
		super(`Cached value could not be decoded: ${key}`)
	}
}
