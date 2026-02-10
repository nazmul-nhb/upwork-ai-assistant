import './App.css';

import type { BgRequest, BgResponse, ExtensionSettings, UpworkJob } from '@/shared/types';
import { useEffect, useState } from 'react';

export default function PopUp() {
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

			// Use chrome.scripting.executeScript via background to extract job
			// data directly — this bypasses the CRXJS content-script loader.
			const extractRes = (await chrome.runtime.sendMessage({
				type: 'EXTRACT_FROM_TAB',
			} satisfies BgRequest)) as BgResponse;

			if (extractRes.ok && extractRes.type === 'ACTIVE_JOB' && extractRes.job) {
				setJob(extractRes.job);
				setStatus('Job detected on this page.');
				return;
			}

			// extractRes.ok === false — show specific error
			if (!extractRes.ok) {
				setStatus(extractRes.error);
			} else {
				setStatus('No Upwork job page detected.');
			}
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
				<button
					disabled={status !== 'Job detected on this page.'}
					onClick={openSidePanel}
				>
					Job Actions
				</button>
				<button className="btn-secondary" onClick={openOptions}>
					&#x2699; Settings
				</button>
			</div>
		</main>
	);
}
