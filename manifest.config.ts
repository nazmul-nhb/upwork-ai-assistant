import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
	manifest_version: 3,
	name: 'Upwork AI Assistant',
	description: pkg.description,
	version: pkg.version,
	icons: {
		48: 'public/logo.png',
	},
	action: {
		default_title: 'Upwork AI Assistant',
		default_icon: {
			48: 'public/logo.png',
		},
		default_popup: 'src/popup/index.html',
	},
	options_ui: {
		page: 'src/options/index.html',
		open_in_tab: true,
	},
	permissions: ['storage', 'tabs', 'sidePanel', 'scripting'],
	host_permissions: [
		'https://www.upwork.com/*',
		'https://api.openai.com/*',
		'https://generativelanguage.googleapis.com/*',
		'https://api.x.ai/*',
	],
	background: {
		service_worker: 'src/background/index.ts',
		type: 'module',
	},
	content_scripts: [
		{
			js: ['src/content/main.tsx'],
			matches: [
				'https://www.upwork.com/nx/find-work/details/*',
				'https://www.upwork.com/jobs/*',
			],
			run_at: 'document_idle',
		},
	],
	side_panel: {
		default_path: 'src/sidepanel/index.html',
	},
});
