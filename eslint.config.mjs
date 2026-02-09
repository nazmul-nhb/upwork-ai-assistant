// @ts-check

import jsConfig from '@eslint/js';
import tsEslintPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import prettier from 'eslint-plugin-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
// @ts-expect-error -- react-hooks plugin types lag behind eslint v10
export default [
	{
		ignores: [
			'node_modules/*',
			'dist/*',
			'coverage/*',
			'release/*',
			'**/*.test.ts',
			'**/__tests__/**/*',
		],
	},
	{
		languageOptions: {
			globals: {
				...globals.node,
				...globals.browser,
				process: 'readonly',
			},
			parser: tsParser,
			ecmaVersion: 'latest',
			sourceType: 'module',
			parserOptions: {
				ecmaFeatures: { jsx: true },
			},
		},
		settings: {
			react: {
				version: 'detect',
			},
		},
	},
	jsConfig.configs.recommended,
	...tseslint.configs.recommended,
	{
		plugins: {
			prettier,
			react,
			'react-hooks': reactHooks,
			'react-refresh': reactRefresh,
		},
		rules: {
			...tsEslintPlugin.configs.recommended.rules,
			...prettierConfig.rules,
			'prettier/prettier': 'off',
			'no-unused-expressions': 'error',
			'prefer-const': 'warn',
			// 'no-console': ['warn', { allow: ['info', 'warn', 'error', 'table'] }],
			'no-undef': 'off',
			'@typescript-eslint/no-empty-object-type': 'off',
			'@typescript-eslint/no-unused-expressions': 'error',
			'@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
			'no-unused-vars': [
				'off',
				{
					args: 'all',
					argsIgnorePattern: '^_',
					caughtErrors: 'all',
					caughtErrorsIgnorePattern: '^_',
					destructuredArrayIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					ignoreRestSiblings: false,
				},
			],
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					args: 'all',
					argsIgnorePattern: '^_',
					caughtErrors: 'all',
					caughtErrorsIgnorePattern: '^_',
					destructuredArrayIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					ignoreRestSiblings: false,
				},
			],
			// "no-use-before-define": "off",

			// React rules
			'react/react-in-jsx-scope': 'off', // Not needed with React 17+ JSX transform
			'react/jsx-uses-react': 'off',
			'react/prop-types': 'off', // TypeScript handles prop validation
			'react/jsx-no-target-blank': 'warn',
			'react/self-closing-comp': 'warn',
			'react/jsx-curly-brace-presence': ['warn', { props: 'never', children: 'never' }],

			// React Hooks
			'react-hooks/rules-of-hooks': 'error',
			'react-hooks/exhaustive-deps': 'warn',

			// React Refresh (for Vite HMR)
			'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
		},
	},
	{
		files: ['src/**/utils/*.ts', 'src/**/*types.ts', 'src/**/types/*.ts'],
		rules: { '@typescript-eslint/no-unsafe-function-type': 'off' },
	},
	{
		files: ['src/**/*types.ts', 'src/**/*interfaces.ts'],
		rules: { 'no-unused-vars': 'off' },
	},
	// {
	// 	files: ['src/classes/**/*.ts', 'src/**/*types.ts', 'src/**/types/*.ts'],
	// 	rules: { '@typescript-eslint/no-explicit-any': 'off' },
	// },
	{
		files: ['**/*.js', '**/*.cjs'],
		rules: { '@typescript-eslint/no-require-imports': 'off' },
	},
	// {
	// 	files: ['**/*plugins.ts', '**/plugins/*.ts'],
	// 	rules: { '@typescript-eslint/consistent-type-imports': 'off' },
	// },
	{
		files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
		rules: {
			// Disallow ONLY `console.log`
			'no-restricted-syntax': [
				'warn',
				{
					selector:
						"CallExpression[callee.object.name='console'][callee.property.name='log']",
					message:
						'Avoid using `console.log`; use `console.info / warn / error / table / dir` etc. instead.',
				},
			],
		},
	},
];
