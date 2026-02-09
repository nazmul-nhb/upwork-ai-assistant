// @ts-check

import { defineScriptConfig } from 'nhb-scripts';

export default defineScriptConfig({
	format: {
		args: ['--write'],
		files: ['src', 'eslint.config.mjs', 'nhb.scripts.config.mjs', 'manifest.config.ts'],
		ignorePath: '.prettierignore',
	},
	lint: { folders: ['src', 'eslint.config.mjs', 'manifest.config.ts'] },
	commit: {
		runFormatter: true,
		emojiBeforePrefix: true,
		wrapPrefixWith: '`',
		commitTypes: {
			custom: [{ emoji: '🚀', type: 'init' }],
		},
	},
	count: {
		defaultPath: '.',
		excludePaths: ['node_modules', 'dist', 'release'],
	},
});
