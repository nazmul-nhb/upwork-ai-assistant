// @ts-check

import { defineScriptConfig } from 'nhb-scripts';

export default defineScriptConfig({
	format: {
		args: ['--write'],
		files: ['.'],
		ignorePath: '.prettierignore',
	},
	lint: { folders: ['src', 'nhb.scripts.config.mjs'], patterns: ['**/*.{ts,tsx,js,jsx}'] },
	commit: {
		runFormatter: false,
		emojiBeforePrefix: true,
		wrapPrefixWith: '`',
		commitTypes: {
			custom: [{ emoji: '🚀', type: 'init' }],
		},
	},
	count: {
		defaultPath: '.',
		excludePaths: ['node_modules', 'dist', 'build'],
	},
});
