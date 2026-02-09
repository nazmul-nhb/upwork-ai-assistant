import {
	isArrayOfType,
	isBoolean,
	isNumber,
	isObject,
	isPositiveInteger,
	isString,
} from 'nhb-toolbox';
import type { ExtensionSettings, LlmProvider } from './types';

const KEY = 'UPWORK_AI_ASSISTANT_SETTINGS_V2';
const PROVIDERS: LlmProvider[] = ['openai', 'gemini', 'grok'];

export async function loadSettings(): Promise<ExtensionSettings | null> {
	const data = await chrome.storage.local.get(KEY);
	const raw = data[KEY] as unknown;
	return isSettings(raw) ? raw : null;
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
	await chrome.storage.local.set({ [KEY]: settings });
}

function isSettings(value: unknown): value is ExtensionSettings {
	if (!isObject(value)) return false;

	if (!PROVIDERS.includes(value.activeProvider as LlmProvider)) return false;
	if (!isBoolean(value.rememberPassphrase)) return false;

	const providers = value.providers;
	if (!isObject(providers)) return false;
	for (const provider of PROVIDERS) {
		const config = providers[provider] as Record<string, unknown>;
		if (!isObject(config)) return false;
		if (!isString(config.model)) return false;
		if (!isString(config.apiKeyEncrypted)) return false;
		if (!isString(config.baseUrl)) return false;
		if (!isNumber(config.temperature)) return false;
		if (!isPositiveInteger(config.maxOutputTokens)) return false;
	}

	const mindset = value.mindset;
	if (!isObject(mindset)) return false;

	return (
		isString(mindset.profileName) &&
		isString(mindset.roleTitle) &&
		isArrayOfType(mindset.coreSkills, isString) &&
		isArrayOfType(mindset.secondarySkills, isString) &&
		isArrayOfType(mindset.noGoSkills, isString) &&
		isArrayOfType(mindset.proposalStyleRules, isString) &&
		isArrayOfType(mindset.redFlags, isString)
	);
}
