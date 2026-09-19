import { MissingBindingError } from './errors.js'

export interface EnvironmentReader<Bindings extends object> {
	all(): Readonly<Bindings>
	has<Key extends PropertyKey>(key: Key): key is Key & keyof Bindings
	optional<Key extends keyof Bindings>(key: Key): Bindings[Key] | undefined
	require<Key extends keyof Bindings>(
		key: Key,
		fallback?: Exclude<Bindings[Key], undefined>,
	): Exclude<Bindings[Key], undefined>
}

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
