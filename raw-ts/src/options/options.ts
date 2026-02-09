import { Cipher } from 'nhb-toolbox/hash';
import type { BgRequest, BgResponse, ExtensionSettings } from '../shared/types';

const $ = <T extends HTMLElement>(id: string): T => {
	const el = document.getElementById(id);
	if (!el) throw new Error(`Missing element: ${id}`);
	return el as T;
};

const apiKeyEl = $('apiKey') as HTMLInputElement;
const passphraseEl = $('passphrase') as HTMLInputElement;
const modelEl = $('model') as HTMLInputElement;

const coreSkillsEl = $('coreSkills') as HTMLTextAreaElement;
const noGoSkillsEl = $('noGoSkills') as HTMLTextAreaElement;
const rulesEl = $('rules') as HTMLTextAreaElement;
const redFlagsEl = $('redFlags') as HTMLTextAreaElement;

const btnSaveKey = $('btnSaveKey') as HTMLButtonElement;
const btnSaveMindset = $('btnSaveMindset') as HTMLButtonElement;

const keyStatus = $('keyStatus');
const mindsetStatus = $('mindsetStatus');

let settings: ExtensionSettings | null = null;

btnSaveKey.addEventListener('click', () => void saveKey());
btnSaveMindset.addEventListener('click', () => void saveMindset());

void init();

async function init(): Promise<void> {
	const res = (await chrome.runtime.sendMessage({
		type: 'GET_SETTINGS',
	} satisfies BgRequest)) as BgResponse;
	console.log({ res });
	if (!res.ok) throw new Error(res.error);
	if (res.type !== 'SETTINGS') throw new Error('Unexpected response.');
	settings = res.settings;

	modelEl.value = settings.mindset.defaultModel;
	coreSkillsEl.value = settings.mindset.coreSkills.join(', ');
	noGoSkillsEl.value = settings.mindset.noGoSkills.join(', ');
	rulesEl.value = settings.mindset.proposalStyleRules.join('\n');
	redFlagsEl.value = settings.mindset.redFlags.join('\n');

	keyStatus.textContent =
		settings.openaiApiKey ? 'Encrypted key is saved.' : 'No key saved yet.';
}

async function saveKey(): Promise<void> {
	if (!settings) throw new Error('Settings not loaded.');

	const apiKey = apiKeyEl.value.trim();
	const passphrase = passphraseEl.value.trim();

	if (!apiKey) {
		keyStatus.textContent = 'API key is empty.';
		return;
	}
	if (passphrase.length < 8) {
		keyStatus.textContent = 'Passphrase should be at least 8 characters.';
		return;
	}

	const cipher = new Cipher(passphrase || 'demo-secret-key');

	const encrypted = await cipher.encrypt(apiKey);
	const next: ExtensionSettings = {
		...settings,
		openaiApiKey: encrypted,
	};

	const res = (await chrome.runtime.sendMessage({
		type: 'SET_SETTINGS',
		settings: next,
	} satisfies BgRequest)) as BgResponse;
	if (!res.ok) throw new Error(res.error);

	keyStatus.textContent = 'Saved encrypted API key.';
	apiKeyEl.value = '';
	settings = next;
}

async function saveMindset(): Promise<void> {
	if (!settings) throw new Error('Settings not loaded.');

	const next: ExtensionSettings = {
		...settings,
		mindset: {
			...settings.mindset,
			defaultModel: modelEl.value.trim() || settings.mindset.defaultModel,
			coreSkills: splitComma(coreSkillsEl.value),
			noGoSkills: splitComma(noGoSkillsEl.value),
			proposalStyleRules: splitLines(rulesEl.value),
			redFlags: splitLines(redFlagsEl.value),
		},
	};

	const res = (await chrome.runtime.sendMessage({
		type: 'SET_SETTINGS',
		settings: next,
	} satisfies BgRequest)) as BgResponse;
	if (!res.ok) throw new Error(res.error);

	mindsetStatus.textContent = 'Saved mindset.';
	settings = next;
}

function splitComma(s: string): string[] {
	return s
		.split(',')
		.map((x) => x.trim())
		.filter((x) => x.length > 0);
}

function splitLines(s: string): string[] {
	return s
		.split('\n')
		.map((x) => x.trim())
		.filter((x) => x.length > 0);
}
