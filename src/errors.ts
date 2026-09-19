export class CloudflareKitError extends Error {
	override name = 'CloudflareKitError'
}

export class MissingBindingError extends CloudflareKitError {
	override name = 'MissingBindingError'

	constructor(key: PropertyKey) {
		super(`Required Cloudflare binding is missing: ${String(key)}`)
	}
}
