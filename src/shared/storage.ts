import { isArrayOfType, isBoolean, isObject, isString } from 'nhb-toolbox';
import type { ExtensionSettings, LlmProvider, ProviderConfig, UserMindset } from './types';

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

function isProviderConfig(value: unknown): value is ProviderConfig {
	if (!isObject(value)) return false;
	const config = value as Record<string, unknown>;

	if (!isString(config.model)) return false;

	// Optional fields — accept correct type OR undefined
	if (config.apiKeyEncrypted !== undefined && !isString(config.apiKeyEncrypted)) return false;
	if (config.baseUrl !== undefined && !isString(config.baseUrl)) return false;
	if (config.temperature !== undefined && typeof config.temperature !== 'number')
		return false;
	if (config.maxOutputTokens !== undefined && typeof config.maxOutputTokens !== 'number')
		return false;

	return true;
}

function isMindset(value: unknown): value is UserMindset {
	if (!isObject(value)) return false;
	const m = value as Record<string, unknown>;

	return (
		isString(m.profileName) &&
		isString(m.roleTitle) &&
		isArrayOfType(m.coreSkills, isString) &&
		isArrayOfType(m.secondarySkills, isString) &&
		isArrayOfType(m.noGoSkills, isString) &&
		isArrayOfType(m.proposalStyleRules, isString) &&
		isArrayOfType(m.redFlags, isString)
	);
}

function isSettings(value: unknown): value is ExtensionSettings {
	if (!isObject(value)) return false;
	const obj = value as Record<string, unknown>;

	if (!PROVIDERS.includes(obj.activeProvider as LlmProvider)) return false;
	if (!isBoolean(obj.rememberPassphrase)) return false;

	const providers = obj.providers;
	if (!isObject(providers)) return false;
	for (const provider of PROVIDERS) {
		if (!isProviderConfig((providers as Record<string, unknown>)[provider])) return false;
	}

	return isMindset(obj.mindset);
}
