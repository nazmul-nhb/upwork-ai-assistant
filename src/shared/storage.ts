import { LLM_PROVIDERS } from '@/shared/constants';
import {
	isArrayOfType,
	isBoolean,
	isNumber,
	isObject,
	isString,
	isUndefined,
} from 'nhb-toolbox';
import type { GenericObject } from 'nhb-toolbox/object/types';
import type { ExtensionSettings, ProviderConfig, UserMindset } from './types';

const KEY = 'UPWORK_AI_ASSISTANT_SETTINGS_V2';

export async function loadSettings(): Promise<ExtensionSettings | null> {
	const data = await chrome.storage.local.get<{ [KEY]: GenericObject }>(KEY);
	const settings = data[KEY];
	return isSettings(settings) ? settings : null;
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
	await chrome.storage.local.set({ [KEY]: settings });
}

function isProviderConfig(value: unknown): value is ProviderConfig {
	if (!isObject(value)) return false;

	if (!isString(value.model)) return false;

	// Optional fields — accept correct type OR undefined
	if (!isUndefined(value.apiKeyEncrypted) && !isString(value.apiKeyEncrypted)) return false;
	if (!isUndefined(value.baseUrl) && !isString(value.baseUrl)) return false;
	if (!isUndefined(value.temperature) && !isNumber(value.temperature)) return false;
	if (!isUndefined(value.maxOutputTokens) && !isNumber(value.maxOutputTokens)) return false;

	return true;
}

function isMindset(value: unknown): value is UserMindset {
	if (!isObject(value)) return false;

	return (
		isString(value.profileName) &&
		isString(value.roleTitle) &&
		isArrayOfType(value.coreSkills, isString) &&
		isArrayOfType(value.secondarySkills, isString) &&
		isArrayOfType(value.noGoSkills, isString) &&
		isArrayOfType(value.proposalStyleRules, isString) &&
		isArrayOfType(value.redFlags, isString)
	);
}

function isSettings(value: unknown): value is ExtensionSettings {
	if (!isObject(value)) return false;
	const obj = value;

	if (!LLM_PROVIDERS.includes(obj.activeProvider)) return false;
	if (!isBoolean(obj.rememberPassphrase)) return false;

	const providers = obj.providers;
	if (!isObject(providers)) return false;
	for (const provider of LLM_PROVIDERS) {
		if (!isProviderConfig(providers[provider])) return false;
	}

	return isMindset(obj.mindset);
}
