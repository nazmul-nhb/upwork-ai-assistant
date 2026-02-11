import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
	manifest_version: 3,
	name: 'Upwork AI Assistant',
	description: pkg.description,
	version: pkg.version,
	author: pkg.author,
	icons: {
		16: 'public/icon.png',
		32: 'public/icon.png',
		48: 'public/icon.png',
		64: 'public/icon.png',
		128: 'public/icon.png',
		256: 'public/icon.png',
	},
	action: {
		default_title: 'Upwork AI Assistant',
		default_icon: {
			48: 'public/icon.png',
		},
		default_popup: 'src/popup/index.html',
	},
	options_ui: {
		page: 'src/options/index.html',
		open_in_tab: true,
	},
	permissions: ['storage', 'tabs', 'activeTab', 'sidePanel', 'scripting'],
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
				'https://www.upwork.com/nx/find-work/best-matches/details/*',
				'https://www.upwork.com/nx/find-work/most-recent/details/*',
				'https://www.upwork.com/nx/find-work/*/details/*',
				'https://www.upwork.com/jobs/*',
			],
			run_at: 'document_idle',
		},
	],
	side_panel: {
		default_path: 'src/sidepanel/index.html',
	},
});
