import type {
	BgRequest,
	BgResponse,
	ContentRequest,
	ContentResponse,
	ExtensionSettings,
	UpworkJob,
} from '@/shared/types';
import { useEffect, useState } from 'react';
import './App.css';

export default function App() {
	const [settings, setSettings] = useState<ExtensionSettings | null>(null);
	const [job, setJob] = useState<UpworkJob | null>(null);
	const [status, setStatus] = useState('Loading...');

	useEffect(() => {
		void init();
	}, []);

	async function init(): Promise<void> {
		try {
			const res = (await chrome.runtime.sendMessage({
				type: 'GET_SETTINGS',
			} satisfies BgRequest)) as BgResponse;

			if (res.ok && res.type === 'SETTINGS') {
				setSettings(res.settings);
			}

			// Try to get the current job
			const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
			const activeTab = tabs[0];
			if (activeTab?.id) {
				try {
					const fromContent = (await chrome.tabs.sendMessage(activeTab.id, {
						type: 'REQUEST_JOB_SNAPSHOT',
					} satisfies ContentRequest)) as ContentResponse;

					if (fromContent.ok) {
						setJob(fromContent.job);
						setStatus('Job detected on this page.');
						return;
					}
				} catch {
					// Content script not available on this page
				}
			}

			setStatus('No Upwork job page detected.');
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'Initialization failed.');
		}
	}

	function openOptions(): void {
		void chrome.runtime.openOptionsPage();
	}

	function openSidePanel(): void {
		void chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
			const tabId = tabs[0]?.id;
			if (tabId != null) {
				void chrome.sidePanel.open({ tabId });
			}
		});
	}

	const provider = settings?.activeProvider?.toUpperCase() ?? '—';
	const hasKey =
		settings ? !!settings.providers[settings.activeProvider].apiKeyEncrypted : false;

	return (
		<main className="popup-root">
			<h1>Upwork AI Assistant</h1>

			<section className="popup-card">
				<p className="popup-label">
					Provider: <strong>{provider}</strong>
				</p>
				<p className="popup-label">
					API key: <strong>{hasKey ? 'Saved' : 'Not set'}</strong>
				</p>

				{job && (
					<p className="popup-label">
						Job: <strong>{job.title}</strong>
					</p>
				)}

				<p className="popup-muted">{status}</p>
			</section>

			<div className="popup-actions">
				<button onClick={openSidePanel}>Open Side Panel</button>
				<button className="btn-secondary" onClick={openOptions}>
					Settings
				</button>
			</div>
		</main>
	);
}
