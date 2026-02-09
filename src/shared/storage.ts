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
	if (!value || typeof value !== 'object') return false;
	const obj = value as Record<string, unknown>;

	if (!PROVIDERS.includes(obj.activeProvider as LlmProvider)) return false;
	if (typeof obj.rememberPassphrase !== 'boolean') return false;

	const providers = obj.providers as unknown;
	if (!providers || typeof providers !== 'object') return false;
	for (const provider of PROVIDERS) {
		const config = (providers as Record<string, unknown>)[provider] as Record<
			string,
			unknown
		>;
		if (!config || typeof config !== 'object') return false;
		if (typeof config.model !== 'string') return false;
		if (config.apiKeyEncrypted != null && typeof config.apiKeyEncrypted !== 'string')
			return false;
		if (config.baseUrl != null && typeof config.baseUrl !== 'string') return false;
		if (config.temperature != null && !isValidNumber(config.temperature)) return false;
		if (config.maxOutputTokens != null && !isValidInteger(config.maxOutputTokens))
			return false;
	}

	const mindset = obj.mindset as unknown;
	if (!mindset || typeof mindset !== 'object') return false;
	const m = mindset as Record<string, unknown>;

	return (
		typeof m.profileName === 'string' &&
		typeof m.roleTitle === 'string' &&
		isStringArray(m.coreSkills) &&
		isStringArray(m.secondarySkills) &&
		isStringArray(m.noGoSkills) &&
		isStringArray(m.proposalStyleRules) &&
		isStringArray(m.redFlags)
	);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isValidNumber(value: unknown): boolean {
	return typeof value === 'number' && Number.isFinite(value);
}

function isValidInteger(value: unknown): boolean {
	return Number.isInteger(value) && (value as number) > 0;
}
