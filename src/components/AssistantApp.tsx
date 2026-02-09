import { Cipher } from 'nhb-toolbox/hash';
import { useEffect, useMemo, useState } from 'react';
import type {
	AnalysisResult,
	BgRequest,
	BgResponse,
	ContentRequest,
	ContentResponse,
	ExtensionSettings,
	LlmProvider,
	UpworkJob,
} from '@/shared/types';
import './AssistantApp.css';

type LayoutMode = 'popup' | 'sidepanel';

const PROVIDERS: LlmProvider[] = ['openai', 'gemini', 'grok'];

type Props = {
	mode: LayoutMode;
};

type ErrorDetails = {
	context: string;
	provider?: LlmProvider;
	statusCode?: number;
	payload?: string;
};

export default function AssistantApp({ mode }: Props) {
	const [settings, setSettings] = useState<ExtensionSettings | null>(null);
	const [job, setJob] = useState<UpworkJob | null>(null);
	const [result, setResult] = useState<AnalysisResult | null>(null);

	const [apiKey, setApiKey] = useState('');
	const [passphrase, setPassphrase] = useState('');

	const [keyStatus, setKeyStatus] = useState('');
	const [saveStatus, setSaveStatus] = useState('');
	const [analysisStatus, setAnalysisStatus] = useState('Loading job details...');
	const [errorDetails, setErrorDetails] = useState<ErrorDetails | null>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		void initialize();
	}, []);

	const activeProvider = settings?.activeProvider ?? 'openai';
	const providerConfig = settings?.providers[activeProvider];

	const jobPreview = useMemo(() => {
		if (!job) return '';

		return [
			`Title: ${job.title}`,
			job.budgetText ? `Budget: ${job.budgetText}` : '',
			job.experienceLevel ? `Experience: ${job.experienceLevel}` : '',
			job.projectType ? `Project type: ${job.projectType}` : '',
			job.skills?.length ? `Skills: ${job.skills.join(', ')}` : '',
			'',
			job.description.slice(0, 1300) + (job.description.length > 1300 ? '\n...\n' : ''),
		]
			.filter(Boolean)
			.join('\n');
	}, [job]);

	async function initialize(): Promise<void> {
		setBusy(true);
		try {
			const response = (await chrome.runtime.sendMessage({
				type: 'GET_SETTINGS',
			} satisfies BgRequest)) as BgResponse;

			if (!response.ok) {
				consumeErrorResponse(response, 'Load settings');
				return;
			}

			if (response.type !== 'SETTINGS') throw new Error('Unexpected settings response.');

			setSettings(response.settings);
			setKeyStatus(
				response.settings.providers[response.settings.activeProvider].apiKeyEncrypted ?
					'Encrypted API key is saved.'
				:	'No encrypted API key saved yet.'
			);

			await refreshJob();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Initialization failed.';
			setSaveStatus(message);
			setAnalysisStatus(message);
		} finally {
			setBusy(false);
		}
	}

	async function persist(next: ExtensionSettings): Promise<boolean> {
		const response = (await chrome.runtime.sendMessage({
			type: 'SET_SETTINGS',
			settings: next,
		} satisfies BgRequest)) as BgResponse;

		if (!response.ok) {
			consumeErrorResponse(response, 'Save settings');
			return false;
		}

		setSettings(next);
		return true;
	}

	async function saveProviderConfig(): Promise<void> {
		if (!settings || !providerConfig) return;

		setKeyStatus('');
		setSaveStatus('');

		if (!apiKey.trim()) {
			setKeyStatus('API key is empty.');
			return;
		}

		if (passphrase.trim().length < 8) {
			setKeyStatus('Passphrase must be at least 8 characters.');
			return;
		}

		try {
			setBusy(true);
			const cipher = new Cipher(passphrase.trim());
			const encrypted = cipher.encrypt(apiKey.trim());

			const next: ExtensionSettings = {
				...settings,
				providers: {
					...settings.providers,
					[settings.activeProvider]: {
						...providerConfig,
						apiKeyEncrypted: encrypted,
					},
				},
			};

			const saved = await persist(next);
			if (!saved) return;

			setApiKey('');
			setKeyStatus('Encrypted API key saved.');
			setErrorDetails(null);
		} catch (error) {
			setKeyStatus(
				error instanceof Error ? error.message : 'Failed to encrypt and save API key.'
			);
		} finally {
			setBusy(false);
		}
	}

	async function saveSettingsOnly(): Promise<void> {
		if (!settings) return;

		try {
			setBusy(true);
			const saved = await persist(settings);
			if (!saved) return;
			setSaveStatus('Settings saved.');
			setErrorDetails(null);
		} finally {
			setBusy(false);
		}
	}

	async function testProviderConnection(): Promise<void> {
		if (!passphrase.trim()) {
			setAnalysisStatus('Passphrase is required to test connection.');
			return;
		}

		setBusy(true);
		setAnalysisStatus(`Testing ${activeProvider.toUpperCase()} connection...`);

		try {
			const response = (await chrome.runtime.sendMessage({
				type: 'TEST_PROVIDER_CONNECTION',
				passphrase: passphrase.trim(),
			} satisfies BgRequest)) as BgResponse;

			if (!response.ok) {
				consumeErrorResponse(response, 'Connection test');
				return;
			}

			if (response.type !== 'CONNECTION_TEST')
				throw new Error('Unexpected connection test response.');

			setAnalysisStatus(response.message);
			setErrorDetails(null);
		} catch (error) {
			setAnalysisStatus(
				error instanceof Error ? error.message : 'Connection test failed.'
			);
		} finally {
			setBusy(false);
		}
	}

	async function refreshJob(): Promise<void> {
		setBusy(true);
		setResult(null);

		try {
			const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
			const activeTab = tabs[0];
			if (!activeTab?.id) throw new Error('No active tab detected.');

			let extracted: UpworkJob | null = null;

			try {
				const fromContent = (await chrome.tabs.sendMessage(activeTab.id, {
					type: 'REQUEST_JOB_SNAPSHOT',
				} satisfies ContentRequest)) as ContentResponse;

				if (fromContent.ok) extracted = fromContent.job;
			} catch {
				// Ignore and fallback to background cache.
			}

			if (!extracted) {
				const fromBackground = (await chrome.runtime.sendMessage({
					type: 'GET_ACTIVE_JOB',
				} satisfies BgRequest)) as BgResponse;

				if (!fromBackground.ok) {
					consumeErrorResponse(fromBackground, 'Get active job');
					return;
				}

				if (fromBackground.type === 'ACTIVE_JOB') extracted = fromBackground.job;
			}

			if (!extracted) {
				throw new Error('Open an Upwork job details page, then click Refresh.');
			}

			setJob(extracted);
			setAnalysisStatus(
				'Job extracted. Run Analyze to generate recommendation and proposal.'
			);
			setErrorDetails(null);
		} catch (error) {
			setJob(null);
			setAnalysisStatus(
				error instanceof Error ? error.message : 'Failed to refresh job.'
			);
		} finally {
			setBusy(false);
		}
	}

	async function analyzeJob(): Promise<void> {
		if (!job) {
			setAnalysisStatus('No job available. Please click Refresh first.');
			return;
		}

		if (!passphrase.trim()) {
			setAnalysisStatus('Passphrase is required to decrypt API key.');
			return;
		}

		setBusy(true);
		setAnalysisStatus('Analyzing with AI...');

		try {
			const response = (await chrome.runtime.sendMessage({
				type: 'ANALYZE_JOB',
				job,
				passphrase: passphrase.trim(),
			} satisfies BgRequest)) as BgResponse;

			if (!response.ok) {
				consumeErrorResponse(response, 'Analyze job');
				return;
			}

			if (response.type !== 'ANALYSIS') throw new Error('Unexpected analysis response.');

			setResult(response.result);
			setAnalysisStatus('Analysis complete.');
			setErrorDetails(null);
		} catch (error) {
			setResult(null);
			setAnalysisStatus(error instanceof Error ? error.message : 'Analysis failed.');
		} finally {
			setBusy(false);
		}
	}

	async function copyProposal(kind: 'short' | 'full'): Promise<void> {
		if (!result) return;
		const text = kind === 'short' ? result.proposalShort : result.proposalFull;
		await navigator.clipboard.writeText(text);
		setAnalysisStatus(`Copied ${kind} proposal.`);
	}

	function consumeErrorResponse(
		response: Extract<BgResponse, { ok: false }>,
		context: string
	): void {
		const providerText = response.provider ? `${response.provider.toUpperCase()} ` : '';
		const statusText = response.statusCode ? `(${response.statusCode}) ` : '';
		setAnalysisStatus(`${context}: ${providerText}${statusText}${response.error}`.trim());

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

	if (!settings || !providerConfig) {
		return <main className={`assistant-root ${mode}`}>Loading...</main>;
	}

	return (
		<main className={`assistant-root ${mode}`}>
			<div className="assistant-hero">
				<h1>Upwork AI Assistant</h1>
				<p>Smart fit scoring, red flags, and proposal drafting in one place.</p>
			</div>

			<section className="assistant-card">
				<h2>Provider</h2>

				<label>
					Active provider
					<select
						value={settings.activeProvider}
						onChange={(event) => {
							const provider = event.target.value as LlmProvider;
							setSettings({ ...settings, activeProvider: provider });
							setKeyStatus(
								settings.providers[provider].apiKeyEncrypted ?
									'Encrypted API key is saved.'
								:	'No encrypted API key saved yet.'
							);
						}}
					>
						{PROVIDERS.map((provider) => (
							<option key={provider} value={provider}>
								{provider}
							</option>
						))}
					</select>
				</label>

				<label>
					Model
					<input
						value={providerConfig.model}
						onChange={(event) =>
							setSettings({
								...settings,
								providers: {
									...settings.providers,
									[activeProvider]: {
										...providerConfig,
										model: event.target.value,
									},
								},
							})
						}
						placeholder="Model name"
					/>
				</label>

				<label>
					Base URL (optional override)
					<input
						value={providerConfig.baseUrl ?? ''}
						onChange={(event) =>
							setSettings({
								...settings,
								providers: {
									...settings.providers,
									[activeProvider]: {
										...providerConfig,
										baseUrl: event.target.value,
									},
								},
							})
						}
						placeholder="Provider endpoint"
					/>
				</label>

				<div className="assistant-row grid-2">
					<label>
						Temperature
						<input
							type="number"
							min={0}
							max={2}
							step={0.1}
							value={providerConfig.temperature ?? 0.2}
							onChange={(event) =>
								setSettings({
									...settings,
									providers: {
										...settings.providers,
										[activeProvider]: {
											...providerConfig,
											temperature: clampNumber(
												parseNumber(event.target.value, 0.2),
												0,
												2
											),
										},
									},
								})
							}
						/>
					</label>

					<label>
						Max output tokens
						<input
							type="number"
							min={1}
							step={1}
							value={providerConfig.maxOutputTokens ?? 1400}
							onChange={(event) =>
								setSettings({
									...settings,
									providers: {
										...settings.providers,
										[activeProvider]: {
											...providerConfig,
											maxOutputTokens: Math.max(
												1,
												Math.floor(
													parseNumber(event.target.value, 1400)
												)
											),
										},
									},
								})
							}
						/>
					</label>
				</div>

				<label>
					API key (stored encrypted)
					<input
						type="password"
						value={apiKey}
						onChange={(event) => setApiKey(event.target.value)}
						placeholder="Paste API key"
					/>
				</label>

				<label>
					Passphrase
					<input
						type="password"
						value={passphrase}
						onChange={(event) => setPassphrase(event.target.value)}
						placeholder="Used for encrypt/decrypt"
					/>
				</label>

				<div className="assistant-row">
					<button disabled={busy} onClick={() => void saveProviderConfig()}>
						Save encrypted key
					</button>
					<button disabled={busy} onClick={() => void saveSettingsOnly()}>
						Save settings
					</button>
					<button disabled={busy} onClick={() => void testProviderConnection()}>
						Test connection
					</button>
				</div>

				<p className="assistant-muted">{keyStatus}</p>
			</section>

			<section className="assistant-card">
				<h2>Mindset</h2>

				<label>
					Profile name
					<input
						value={settings.mindset.profileName}
						onChange={(event) =>
							setSettings({
								...settings,
								mindset: {
									...settings.mindset,
									profileName: event.target.value,
								},
							})
						}
					/>
				</label>

				<label>
					Role title
					<input
						value={settings.mindset.roleTitle}
						onChange={(event) =>
							setSettings({
								...settings,
								mindset: { ...settings.mindset, roleTitle: event.target.value },
							})
						}
					/>
				</label>

				<label>
					Core skills (comma separated)
					<textarea
						rows={3}
						value={settings.mindset.coreSkills.join(', ')}
						onChange={(event) =>
							setSettings({
								...settings,
								mindset: {
									...settings.mindset,
									coreSkills: splitComma(event.target.value),
								},
							})
						}
					/>
				</label>

				<label>
					Secondary skills (comma separated)
					<textarea
						rows={2}
						value={settings.mindset.secondarySkills.join(', ')}
						onChange={(event) =>
							setSettings({
								...settings,
								mindset: {
									...settings.mindset,
									secondarySkills: splitComma(event.target.value),
								},
							})
						}
					/>
				</label>

				<label>
					No-go skills (comma separated)
					<textarea
						rows={2}
						value={settings.mindset.noGoSkills.join(', ')}
						onChange={(event) =>
							setSettings({
								...settings,
								mindset: {
									...settings.mindset,
									noGoSkills: splitComma(event.target.value),
								},
							})
						}
					/>
				</label>

				<label>
					Proposal rules (one per line)
					<textarea
						rows={4}
						value={settings.mindset.proposalStyleRules.join('\n')}
						onChange={(event) =>
							setSettings({
								...settings,
								mindset: {
									...settings.mindset,
									proposalStyleRules: splitLines(event.target.value),
								},
							})
						}
					/>
				</label>

				<label>
					Red flags (one per line)
					<textarea
						rows={4}
						value={settings.mindset.redFlags.join('\n')}
						onChange={(event) =>
							setSettings({
								...settings,
								mindset: {
									...settings.mindset,
									redFlags: splitLines(event.target.value),
								},
							})
						}
					/>
				</label>

				<p className="assistant-muted">{saveStatus}</p>
			</section>

			<section className="assistant-card">
				<h2>Analyze Job</h2>

				<div className="assistant-row">
					<button disabled={busy} onClick={() => void refreshJob()}>
						Refresh
					</button>
					<button disabled={busy || !job} onClick={() => void analyzeJob()}>
						Analyze
					</button>
					<button disabled={!result} onClick={() => void copyProposal('short')}>
						Copy short
					</button>
					<button disabled={!result} onClick={() => void copyProposal('full')}>
						Copy full
					</button>
				</div>

				<label>
					Job preview
					<pre>{jobPreview || 'No job preview available.'}</pre>
				</label>

				{!result ?
					<p className="assistant-muted">Run Analyze to see results.</p>
				:	<div className="assistant-result">
						<p>
							<strong>Apply:</strong> {result.shouldApply ? 'YES' : 'NO'} |{' '}
							<strong>Fit:</strong> {result.fitScore}/100
						</p>

						<strong>Reasons</strong>
						<ul>
							{result.keyReasons.map((item) => (
								<li key={`reason-${item}`}>{item}</li>
							))}
						</ul>

						<strong>Risks</strong>
						<ul>
							{result.risks.map((item) => (
								<li key={`risk-${item}`}>{item}</li>
							))}
						</ul>

						<strong>Questions to ask</strong>
						<ul>
							{result.questionsToAsk.map((item) => (
								<li key={`question-${item}`}>{item}</li>
							))}
						</ul>

						{result.bidSuggestion ?
							<p>
								<strong>Bid suggestion:</strong> {result.bidSuggestion}
							</p>
						:	null}

						<strong>Proposal (short)</strong>
						<pre>{result.proposalShort}</pre>

						<strong>Proposal (full)</strong>
						<pre>{result.proposalFull}</pre>
					</div>
				}

				<p className="assistant-muted">{analysisStatus}</p>
			</section>

			{errorDetails?.payload ?
				<section className="assistant-card error-card">
					<h2>Raw Provider Error</h2>
					<p className="assistant-muted">
						{errorDetails.context}
						{errorDetails.provider ?
							` | ${errorDetails.provider.toUpperCase()}`
						:	''}
						{errorDetails.statusCode ? ` (${errorDetails.statusCode})` : ''}
					</p>
					<pre>{errorDetails.payload}</pre>
				</section>
			:	null}
		</main>
	);
}

function splitComma(value: string): string[] {
	return value
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

function splitLines(value: string): string[] {
	return value
		.split('\n')
		.map((item) => item.trim())
		.filter(Boolean);
}

function parseNumber(value: string, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}
