/** Typed access to application-supplied bindings, not process.env. @see docs/environment.md */
import { MissingBindingError } from './errors.js'

/** Reads original bindings without schema validation, coercion, or secret filtering. */
export interface EnvironmentReader<Bindings extends object> {
	/** Returns the original object; Readonly is not a runtime freeze. */
	all(): Readonly<Bindings>
	/** Tests for an own property whose value is not undefined. */
	has<Key extends PropertyKey>(key: Key): key is Key & keyof Bindings
	/** Returns the property value or undefined; does not apply a fallback. */
	optional<Key extends keyof Bindings>(key: Key): Bindings[Key] | undefined
	/**
	 * Preserves null/false/0/empty string; uses fallback only for undefined.
	 * @throws MissingBindingError when both binding and fallback are undefined.
	 */
	require<Key extends keyof Bindings>(
		key: Key,
		fallback?: Exclude<Bindings[Key], undefined>,
	): Exclude<Bindings[Key], undefined>
}

/** Creates a typed reader without copying bindings or doing I/O; usable without a scope. */
export function createEnvironment<Bindings extends object>(
	bindings: Bindings,
): EnvironmentReader<Bindings> {
	return {
		all() {
			return bindings
		},
		has<Key extends PropertyKey>(key: Key): key is Key & keyof Bindings {
			return (
				Object.hasOwn(bindings, key) && Reflect.get(bindings, key) !== undefined
			)
		},
		optional<Key extends keyof Bindings>(key: Key) {
			return bindings[key]
		},
		require<Key extends keyof Bindings>(
			key: Key,
			fallback?: Exclude<Bindings[Key], undefined>,
		) {
			const value = bindings[key]
			if (value !== undefined) {
				return value as Exclude<Bindings[Key], undefined>
			}

			if (fallback !== undefined) return fallback
			throw new MissingBindingError(key)
		},
	}
}
