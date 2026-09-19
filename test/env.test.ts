import { describe, expect, it } from 'vitest'

import { MissingBindingError, createEnvironment } from '../src/index.js'

describe('createEnvironment', () => {
	it('preserves falsey values', () => {
		const environment = createEnvironment({
			DISABLED: false,
			EMPTY: '',
			PORT: 0,
		})

		expect(environment.require('DISABLED')).toBe(false)
		expect(environment.require('EMPTY')).toBe('')
		expect(environment.require('PORT')).toBe(0)
	})

	it('uses a falsey fallback only for an undefined binding', () => {
		const environment = createEnvironment<{
			EMPTY?: string
			MISSING?: string
		}>({ EMPTY: '' })

		expect(environment.require('EMPTY', 'fallback')).toBe('')
		expect(environment.require('MISSING', '')).toBe('')
	})

	it('throws a package error for a missing required binding', () => {
		const environment = createEnvironment<{ TOKEN?: string }>({})

		expect(() => environment.require('TOKEN')).toThrow(MissingBindingError)
	})
})
