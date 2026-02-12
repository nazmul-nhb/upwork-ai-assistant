import './App.css';

import { useMindSet } from '@/hooks/useMindSet';
import { LLM_PROVIDERS } from '@/shared/constants';
import type { BgRequest, BgResponse, ExtensionSettings, LLMProvider } from '@/shared/types';
import { clampNumber } from 'nhb-toolbox';
import { COUNTRIES } from 'nhb-toolbox/constants';
import { Cipher } from 'nhb-toolbox/hash';
import { useEffect, useMemo, useState } from 'react';

export default function Options() {
	const [settings, setSettings] = useState<ExtensionSettings | null>(null);
	const [apiKey, setApiKey] = useState('');
	const [passphrase, setPassphrase] = useState('');

	const [keyStatus, setKeyStatus] = useState('');
	const [settingsStatus, setSettingsStatus] = useState('');
	const [connectionStatus, setConnectionStatus] = useState('');

	const [busy, setBusy] = useState(false);

	const mindset = useMemo(() => settings?.mindset, [settings]);

	// Local state for text inputs to allow free typing
	const [coreSkillsStr, setCoreSkillsStr] = useMindSet(mindset?.coreSkills, ', ');
	const [secondarySkillsStr, setSecondarySkillsStr] = useMindSet(mindset?.secondarySkills);
	const [noGoSkillsStr, setNoGoSkillsStr] = useMindSet(mindset?.noGoSkills, ', ');
	const [proposalRules, setProposalRules] = useMindSet(mindset?.proposalStyleRules, '\n');
	const [redFlagsStr, setRedFlagsStr] = useMindSet(mindset?.redFlags, '\n');

	useEffect(() => {
		void loadSettingsFromBg();
	}, []);

	const activeProvider = settings?.activeProvider ?? 'openai';
	const providerConfig = settings?.providers[activeProvider];

	async function loadSettingsFromBg(): Promise<void> {
		try {
			const response = await chrome.runtime.sendMessage<BgRequest, BgResponse>({
				type: 'GET_SETTINGS',
			});

			if (!response.ok) {
				setSettingsStatus(`Error: ${response.error}`);
				return;
			}

			if (response.type !== 'SETTINGS') return;

			setSettings(response.settings);
			const cfg = response.settings.providers[response.settings.activeProvider];
			setKeyStatus(
				cfg.apiKeyEncrypted ?
					'Encrypted API key is saved.'
				:	'No encrypted API key saved yet.'
			);
		} catch (error) {
			setSettingsStatus(
				error instanceof Error ? error.message : 'Failed to load settings.'
			);
		}
	}

	async function persist(next: ExtensionSettings): Promise<boolean> {
		const response = await chrome.runtime.sendMessage<BgRequest, BgResponse>({
			type: 'SET_SETTINGS',
			settings: next,
		});

		if (!response.ok) {
			setSettingsStatus(`Save failed: ${response.error}`);
			return false;
		}

		setSettings(next);
		return true;
	}

	async function saveApiKey(): Promise<void> {
		if (!settings || !providerConfig) return;

		setKeyStatus('');

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
					[activeProvider]: {
						...providerConfig,
						apiKeyEncrypted: encrypted,
					},
				},
			};

			const saved = await persist(next);
			if (!saved) return;

			setApiKey('');
			setKeyStatus('Encrypted API key saved.');
		} catch (error) {
			setKeyStatus(error instanceof Error ? error.message : 'Encryption failed.');
		} finally {
			setBusy(false);
		}
	}

	async function saveAllSettings(): Promise<void> {
		if (!settings) return;

		try {
			setBusy(true);
			const saved = await persist(settings);
			if (saved) setSettingsStatus('All settings saved.');
		} finally {
			setBusy(false);
		}
	}

	async function testConnection(): Promise<void> {
		if (!passphrase.trim()) {
			setConnectionStatus('Passphrase is required to test connection.');
			return;
		}

		setBusy(true);
		setConnectionStatus(`Testing ${activeProvider.toUpperCase()} connection...`);

		try {
			const response = await chrome.runtime.sendMessage<BgRequest, BgResponse>({
				type: 'TEST_PROVIDER_CONNECTION',
				passphrase: passphrase.trim(),
			});

			if (!response.ok) {
				setConnectionStatus(`Error: ${response.error}`);
				return;
			}
			if (response.type === 'CONNECTION_TEST') {
				setConnectionStatus(response.message);
			}
		} catch (error) {
			setConnectionStatus(
				error instanceof Error ? error.message : 'Connection test failed.'
			);
		} finally {
			setBusy(false);
		}
	}

	if (!settings || !providerConfig) {
		return <main className="options-root">Loading settings...</main>;
	}

	return (
		<main className="options-root">
			<h1>Upwork AI Assistant — Settings</h1>

			{/* Provider Configuration */}
			<section className="options-card">
				<h2>Provider Configuration</h2>

				<label>
					Active provider
					<select
						value={activeProvider}
						onChange={(e) => {
							const provider = e.target.value as LLMProvider;
							setSettings({ ...settings, activeProvider: provider });
							setKeyStatus(
								settings.providers[provider].apiKeyEncrypted ?
									'Encrypted API key is saved.'
								:	'No encrypted API key saved yet.'
							);
						}}
					>
						{LLM_PROVIDERS.map((p) => (
							<option key={p} value={p}>
								{p}
							</option>
						))}
					</select>
				</label>

				<label>
					Model
					<input
						value={providerConfig.model}
						onChange={(e) =>
							setSettings({
								...settings,
								providers: {
									...settings.providers,
									[activeProvider]: {
										...providerConfig,
										model: e.target.value,
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
						onChange={(e) =>
							setSettings({
								...settings,
								providers: {
									...settings.providers,
									[activeProvider]: {
										...providerConfig,
										baseUrl: e.target.value,
									},
								},
							})
						}
						placeholder="Provider endpoint"
					/>
				</label>

				<div className="options-row grid-2">
					<label>
						Temperature
						<input
							type="number"
							min={0}
							max={2}
							step={0.1}
							value={providerConfig.temperature ?? 0.2}
							onChange={(e) =>
								setSettings({
									...settings,
									providers: {
										...settings.providers,
										[activeProvider]: {
											...providerConfig,
											temperature: clampNumber(
												parseNum(e.target.value, 0.2),
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
							onChange={(e) =>
								setSettings({
									...settings,
									providers: {
										...settings.providers,
										[activeProvider]: {
											...providerConfig,
											maxOutputTokens: Math.max(
												1,
												Math.floor(parseNum(e.target.value, 1400))
											),
										},
									},
								})
							}
						/>
					</label>
				</div>
			</section>

			{/* API Key */}
			<section className="options-card">
				<h2>API Key (encrypted in storage)</h2>

				<label>
					API key
					<input
						type="password"
						value={apiKey}
						onChange={(e) => setApiKey(e.target.value)}
						placeholder="Paste API key"
					/>
				</label>

				<label>
					Passphrase
					<input
						type="password"
						value={passphrase}
						onChange={(e) => setPassphrase(e.target.value)}
						placeholder="Used for encrypt / decrypt (min 8 chars)"
					/>
				</label>

				<div className="options-row">
					<button disabled={busy} onClick={() => void saveApiKey()}>
						Encrypt &amp; save key
					</button>
					<button disabled={busy} onClick={() => void testConnection()}>
						Test connection
					</button>
				</div>

				<p className="options-muted">{keyStatus}</p>
				{connectionStatus && <p className="options-muted">{connectionStatus}</p>}
			</section>

			{/* Mindset */}
			<section className="options-card">
				<h2>Mindset / Profile</h2>

				<label>
					Profile name
					<input
						value={settings.mindset.profileName}
						onChange={(e) =>
							setSettings({
								...settings,
								mindset: { ...settings.mindset, profileName: e.target.value },
							})
						}
					/>
				</label>

				<label>
					Experience
					<input
						placeholder="Your experience, e.g. 2+ years"
						value={settings.mindset.experience ?? ''}
						onChange={(e) =>
							setSettings({
								...settings,
								mindset: { ...settings.mindset, experience: e.target.value },
							})
						}
					/>
				</label>

				<label>
					Location
					<input
						list="countries-datalist"
						value={settings.mindset.location ?? ''}
						onChange={(e) =>
							setSettings({
								...settings,
								mindset: { ...settings.mindset, location: e.target.value },
							})
						}
						placeholder="Select or type your country/location"
					/>
					<datalist id="countries-datalist">
						{COUNTRIES.map((country) => {
							const { country_code, country_name, iso_code } = country;

							return (
								<option key={country_code} value={country_name}>
									{country_name}-{iso_code} ({country_code})
								</option>
							);
						})}
					</datalist>
				</label>

				<label>
					Role title
					<input
						value={settings.mindset.roleTitle}
						onChange={(e) =>
							setSettings({
								...settings,
								mindset: { ...settings.mindset, roleTitle: e.target.value },
							})
						}
					/>
				</label>

				<label>
					Core skills (comma separated)
					<textarea
						rows={3}
						value={coreSkillsStr}
						onChange={(e) => setCoreSkillsStr(e.target.value)}
						onBlur={() =>
							setSettings({
								...settings,
								mindset: {
									...settings.mindset,
									coreSkills: splitComma(coreSkillsStr),
								},
							})
						}
					/>
				</label>

				<label>
					Secondary skills (comma separated)
					<textarea
						rows={3}
						value={secondarySkillsStr}
						onChange={(e) => setSecondarySkillsStr(e.target.value)}
						onBlur={() =>
							setSettings({
								...settings,
								mindset: {
									...settings.mindset,
									secondarySkills: splitComma(secondarySkillsStr),
								},
							})
						}
					/>
				</label>

				<label>
					No-go skills (comma separated)
					<textarea
						rows={3}
						value={noGoSkillsStr}
						onChange={(e) => setNoGoSkillsStr(e.target.value)}
						onBlur={() =>
							setSettings({
								...settings,
								mindset: {
									...settings.mindset,
									noGoSkills: splitComma(noGoSkillsStr),
								},
							})
						}
					/>
				</label>

				<label>
					Proposal rules (one per line)
					<textarea
						rows={4}
						value={proposalRules}
						onChange={(e) => setProposalRules(e.target.value)}
						onBlur={() =>
							setSettings({
								...settings,
								mindset: {
									...settings.mindset,
									proposalStyleRules: splitLines(proposalRules),
								},
							})
						}
					/>
				</label>

				<label>
					Red flags (one per line)
					<textarea
						rows={4}
						value={redFlagsStr}
						onChange={(e) => setRedFlagsStr(e.target.value)}
						onBlur={() =>
							setSettings({
								...settings,
								mindset: {
									...settings.mindset,
									redFlags: splitLines(redFlagsStr),
								},
							})
						}
					/>
				</label>
			</section>

			{/* Save All */}
			<section className="options-card">
				<div className="options-row">
					<button disabled={busy} onClick={() => void saveAllSettings()}>
						Save all settings
					</button>
				</div>
				{settingsStatus && <p className="options-muted">{settingsStatus}</p>}
			</section>
		</main>
	);
}

function splitComma(value: string): string[] {
	return value
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

function splitLines(value: string): string[] {
	return value
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean);
}

function parseNum(value: string, fallback: number): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}
