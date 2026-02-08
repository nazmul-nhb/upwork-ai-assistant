// @ts-check

import { defineScriptConfig, expressMongooseZodTemplate } from 'nhb-scripts';

export default defineScriptConfig({
	format: {
		args: ['--write'],
		files: ['.'],
		ignorePath: '.prettierignore',
	},
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
