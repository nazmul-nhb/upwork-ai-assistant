import type { ManifestV3Export } from '@crxjs/vite-plugin';

const manifest: ManifestV3Export = {
	manifest_version: 3,
	name: 'Upwork AI Assistant (Nazmul preset)',
	version: '0.0.1',
	description:
		'Analyze Upwork jobs in-page and draft proposals using your preset skills & mindset.',
	action: {
		default_title: 'Upwork AI Assistant',
	},
	icons: {
		'128': 'src/assets/icon-128.png',
	},
	permissions: ['storage', 'activeTab', 'scripting', 'sidePanel'],
	host_permissions: ['https://www.upwork.com/*', 'https://api.openai.com/*'],
	background: {
		service_worker: 'src/service-worker/index.ts',
		type: 'module',
	},
	content_scripts: [
		{
			matches: ['https://www.upwork.com/nx/find-work/details/*'],
			js: ['src/content/upworkContent.ts'],
			run_at: 'document_idle',
		},
	],
	side_panel: {
		default_path: 'src/sidepanel/index.html',
	},
	options_page: 'src/options/index.html',
};

export default manifest;
