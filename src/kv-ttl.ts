import { InvalidTtlError } from './errors.js'

export function assertValidKvExpirationTtl(ttlSeconds: number): void {
	if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60) {
		throw new InvalidTtlError(ttlSeconds)
	}
}
