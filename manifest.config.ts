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
	permissions: ['sidePanel', 'contentSettings'],
	content_scripts: [
		{
			js: ['src/content/main.tsx'],
			matches: ['https://*/*'],
		},
	],
	side_panel: {
		default_path: 'src/sidepanel/index.html',
	},
});
