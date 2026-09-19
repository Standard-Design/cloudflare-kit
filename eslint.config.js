import eslint from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

export default tseslint.config(
	{
		ignores: [
			'dist/**',
			'node_modules/**',
			'test/fixtures/worker/worker-configuration.d.ts',
			'test/types/**',
		],
	},
	eslint.configs.recommended,
	{
		files: ['**/*.{ts,tsx}'],
		extends: [
			...tseslint.configs.strictTypeChecked,
			...tseslint.configs.stylisticTypeChecked,
		],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-unnecessary-condition': 'off',
			'@typescript-eslint/no-unnecessary-type-parameters': 'off',
			'@typescript-eslint/prefer-readonly-parameter-types': 'off',
		},
	},
	{
		files: ['**/*.{js,mjs}'],
		languageOptions: {
			globals: {
				process: 'readonly',
			},
		},
	},
	eslintConfigPrettier,
)
