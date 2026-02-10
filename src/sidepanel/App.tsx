import { buildPrompt } from '@/shared/prompt';
import './App.css';

import type {
	AnalysisResult,
	BgRequest,
	BgResponse,
	ErrorDetails,
	ExtensionSettings,
	UpworkJob,
} from '@/shared/types';
import { formatJobPreview } from '@/shared/upwork';
import { useCopyText } from 'nhb-hooks';
import { toTitleCase } from 'nhb-toolbox/change-case';
import { useEffect, useMemo, useState } from 'react';

type ProposalKind = 'short' | 'full';
type CopyProps = {
	kind: ProposalKind;
};

export default function SidePanel() {
	const [settings, setSettings] = useState<ExtensionSettings | null>(null);
	const [job, setJob] = useState<UpworkJob | null>(null);
	const [result, setResult] = useState<AnalysisResult | null>(null);

	const [passphrase, setPassphrase] = useState('');
	const [rememberPassphrase, setRememberPassphrase] = useState(false);
	const [status, setStatus] = useState('Loading...');
	const [errorDetails, setErrorDetails] = useState<ErrorDetails | null>(null);
	const [busy, setBusy] = useState(false);
	const [lastCopied, setLastCopied] = useState<'job' | 'prompt' | ProposalKind | null>(null);

	const { copiedText, copyToClipboard } = useCopyText({
		onSuccess: (text) => {
			setStatus(text);
		},
		onError: (msg) => {
			setStatus(msg);
		},
		resetTimeOut: 2000,
	});

	useEffect(() => {
		void init();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const jobPreview = useMemo(() => {
		if (!job) return '';
		return formatJobPreview(job);
	}, [job]);

	async function init(): Promise<void> {
		setBusy(true);
		try {
			const res = (await chrome.runtime.sendMessage({
				type: 'GET_SETTINGS',
			} satisfies BgRequest)) as BgResponse;

			if (!res.ok) {
				setStatus(`Error: ${res.error}`);
				return;
			}
			if (res.type !== 'SETTINGS') return;

			setSettings(res.settings);
			setRememberPassphrase(res.settings.rememberPassphrase);

			// Restore passphrase from session if remembered
			if (res.settings.rememberPassphrase) {
				try {
					const session = await chrome.storage.session.get('sessionPassphrase');
					if (session.sessionPassphrase) {
						setPassphrase(session.sessionPassphrase as string);
					}
				} catch {
					// session storage may not be available
				}
			}

			const config = res.settings.providers[res.settings.activeProvider];
			if (!config.apiKeyEncrypted) {
				setStatus('No API key configured. Open Settings to set one up.');
			} else {
				await refreshJob();
			}
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'Initialization failed.');
		} finally {
			setBusy(false);
		}
	}

	async function refreshJob(): Promise<void> {
		setBusy(true);
		setResult(null);
		setErrorDetails(null);

		try {
			// Use chrome.scripting.executeScript via background — bypasses CRXJS
			// content-script loader entirely so it works even on first load.
			const res = (await chrome.runtime.sendMessage({
				type: 'EXTRACT_FROM_TAB',
			} satisfies BgRequest)) as BgResponse;

			if (res.ok && res.type === 'ACTIVE_JOB' && res.job) {
				setJob(res.job);
				setStatus(
					'Job extracted. Run "Analyze Job" to generate recommendation and proposal.'
				);
				return;
			}

			// Show the specific error from the background
			if (!res.ok) {
				throw new Error(res.error);
			}

			throw new Error('Open an Upwork job details page, then click Refresh.');
		} catch (error) {
			setJob(null);
			setStatus(error instanceof Error ? error.message : 'Failed to refresh job.');
		} finally {
			setBusy(false);
		}
	}

	async function analyzeJob(): Promise<void> {
		if (!job) {
			setStatus('No job available. Click Refresh first.');
			return;
		}
		if (!passphrase.trim()) {
			setStatus('Enter your passphrase to decrypt the API key.');
			return;
		}

		setBusy(true);
		setStatus('Analyzing with AI...');

		try {
			const response = (await chrome.runtime.sendMessage({
				type: 'ANALYZE_JOB',
				job,
				passphrase: passphrase.trim(),
			} satisfies BgRequest)) as BgResponse;

			if (!response.ok) {
				consumeError(response, 'Analyze');
				return;
			}
			if (response.type !== 'ANALYSIS') throw new Error('Unexpected response type.');

			setResult(response.result);
			setStatus('Analysis complete.');
			setErrorDetails(null);

			// Persist passphrase for session if remembered
			if (rememberPassphrase) {
				void chrome.storage.session.set({ sessionPassphrase: passphrase.trim() });
			}
		} catch (error) {
			setResult(null);
			setStatus(error instanceof Error ? error.message : 'Analysis failed.');
		} finally {
			setBusy(false);
		}
	}

	async function copyPrompt(): Promise<void> {
		if (!settings?.mindset || !job) return;

		const { instructions, input } = buildPrompt(settings?.mindset, job, true);

		setLastCopied('prompt');
		await copyToClipboard(
			instructions.concat('\n\n', input),
			`Copied prompt to clipboard.`
		);
		setTimeout(() => setLastCopied(null), 2000);
	}

	async function copyJobDetails() {
		if (!job) return;

		setLastCopied('job');
		await copyToClipboard(formatJobPreview(job, false), 'Copied job details to clipboard.');
		setTimeout(() => setLastCopied(null), 2000);
	}

	function consumeError(response: Extract<BgResponse, { ok: false }>, context: string): void {
		const prov = response.provider ? `${response.provider.toUpperCase()} ` : '';
		const code = response.statusCode ? `(${response.statusCode}) ` : '';
		setStatus(`${context}: ${prov}${code}${response.error}`.trim());

		if (response.rawError) {
			setErrorDetails({
				context,
				provider: response.provider,
				statusCode: response.statusCode,
				payload: response.rawError,
			});
		} else {
			setErrorDetails(null);
		}
	}

	function openOptions(): void {
		void chrome.runtime.openOptionsPage();
	}

	const provider = settings?.activeProvider?.toUpperCase() ?? '—';

	function CopyProposal({ kind }: CopyProps) {
		const capKind = toTitleCase(kind);

		return (
			<button
				disabled={!result}
				onClick={async () => {
					if (!result) return;

					const text = kind === 'short' ? result.proposalShort : result.proposalFull;

					setLastCopied(kind);

					await copyToClipboard(text, `Copied ${kind} proposal.`);

					setTimeout(() => setLastCopied(null), 2000);
				}}
			>
				{copiedText && lastCopied === kind ?
					`${capKind} Proposal Copied!`
				:	`Copy ${capKind} Proposal`}
			</button>
		);
	}

	return (
		<main className="side-root">
			<div className="side-hero">
				<h1>Upwork AI Assistant</h1>
				<p className="flex-provider">
					<span>
						Provider: <strong>{provider}</strong>
					</span>
					<a href="#" onClick={openOptions}>
						<strong>&#x2699; Settings</strong>
					</a>
				</p>
			</div>

			{/* Passphrase + Actions */}
			<section className="side-card">
				<label>
					Passphrase
					<input
						type="password"
						value={passphrase}
						onChange={(e) => setPassphrase(e.target.value)}
						placeholder="Passphrase to decrypt your API key"
					/>
				</label>

				<div className="side-checkbox">
					<input
						type="checkbox"
						name="rememberPass"
						id="rememberPass"
						checked={rememberPassphrase}
						onChange={(e) => {
							const checked = e.target.checked;
							setRememberPassphrase(checked);

							if (settings) {
								const updated = { ...settings, rememberPassphrase: checked };
								setSettings(updated);
								void chrome.runtime.sendMessage({
									type: 'SET_SETTINGS',
									settings: updated,
								} satisfies BgRequest);
							}

							if (!checked) {
								void chrome.storage.session.remove('sessionPassphrase');
							} else if (passphrase.trim()) {
								void chrome.storage.session.set({
									sessionPassphrase: passphrase.trim(),
								});
							}
						}}
					/>
					<label htmlFor="rememberPass">Remember passphrase for this session</label>
				</div>

				<div className="side-row">
					<button disabled={busy} onClick={() => void refreshJob()}>
						{busy ? 'Working...' : 'Refresh Job'}
					</button>
					<button disabled={busy || !job} onClick={() => void analyzeJob()}>
						{busy ? 'Working...' : 'Analyze Job'}
					</button>
					<button disabled={busy || !job} onClick={() => void copyPrompt()}>
						{copiedText && lastCopied === 'prompt' ?
							'Prompt Copied!'
						:	'Copy Prompt'}
					</button>
					<button disabled={busy || !job} onClick={() => void copyJobDetails()}>
						{copiedText && lastCopied === 'job' ?
							'Job Details Copied!'
						:	'Copy Job Details'}
					</button>
					<CopyProposal kind="short" />
					<CopyProposal kind="full" />
				</div>

				<p className="side-muted">{status}</p>
			</section>

			{/* Job Preview */}
			<section className="side-card">
				<h2>Job Details Preview</h2>
				<pre>{jobPreview || 'No job preview available.'}</pre>
			</section>

			{/* Analysis Results */}
			{result && (
				<section className="side-card">
					<h2>Analysis</h2>
					<div className="side-result">
						<p>
							<strong>Apply:</strong> {result.shouldApply ? 'YES' : 'NO'} |{' '}
							<strong>Fit:</strong> {result.fitScore}%
						</p>

						<strong>Reasons</strong>
						<ul>
							{result.keyReasons.map((item, i) => (
								<li key={`r-${i}`}>{item}</li>
							))}
						</ul>

						<strong>Risks</strong>
						<ul>
							{result.risks.map((item, i) => (
								<li key={`k-${i}`}>{item}</li>
							))}
						</ul>

						<strong>Questions to ask</strong>
						<ul>
							{result.questionsToAsk.map((item, i) => (
								<li key={`q-${i}`}>{item}</li>
							))}
						</ul>

						{result.bidSuggestion && (
							<p>
								<strong>Bid suggestion:</strong> {result.bidSuggestion}
							</p>
						)}
						<h3>Proposal (Short)</h3>
						<pre>{result.proposalShort}</pre>
						<CopyProposal kind="short" />
						<br />
						<h3>Proposal (Full)</h3>
						<pre>{result.proposalFull}</pre>
						<CopyProposal kind="full" />
					</div>
				</section>
			)}

			{/* Raw Error */}
			{errorDetails?.payload && (
				<section className="side-card error-card">
					<h2>Raw Provider Error</h2>
					<p className="side-muted">
						{errorDetails.context}
						{errorDetails.provider ?
							` | ${errorDetails.provider.toUpperCase()}`
						:	''}
						{errorDetails.statusCode ? ` (${errorDetails.statusCode})` : ''}
					</p>
					<pre>{errorDetails.payload}</pre>
				</section>
			)}
		</main>
	);
}
