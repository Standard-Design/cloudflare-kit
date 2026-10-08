/** Shared KV write constraint; intentionally separate from HTTP's zero-capable TTL. */
import { InvalidTtlError } from './errors.js'

/** Rejects unsupported KV relative expirations before storage I/O. @throws InvalidTtlError */
export function assertValidKvExpirationTtl(ttlSeconds: number): void {
	if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60) {
		throw new InvalidTtlError(ttlSeconds)
	}
}
