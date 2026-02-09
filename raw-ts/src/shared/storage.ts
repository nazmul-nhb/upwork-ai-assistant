import { isArrayOfType, isBoolean, isObject, isString } from 'nhb-toolbox';
import type { ExtensionSettings } from './types';

const KEY = 'UPWORK_AI_ASSISTANT_SETTINGS_V1';

export async function loadSettings(): Promise<ExtensionSettings | null> {
	const data = await chrome.storage.local.get(KEY);
	const v = data[KEY];
	return isSettings(v) ? v : null;
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
	await chrome.storage.local.set({ [KEY]: settings });
}

function isSettings(v: unknown): v is ExtensionSettings {
	if (!isObject(v)) return false;

	if (v.provider !== 'openai') return false;

	const mindset = v.mindset;
	if (!isObject(mindset)) return false;

	return (
		isString(mindset.profileName) &&
		isString(mindset.roleTitle) &&
		isArrayOfType(mindset.coreSkills, isString) &&
		isArrayOfType(mindset.secondarySkills, isString) &&
		isArrayOfType(mindset.noGoSkills, isString) &&
		isArrayOfType(mindset.proposalStyleRules, isString) &&
		isArrayOfType(mindset.redFlags, isString) &&
		isString(mindset.defaultModel) &&
		isBoolean(v.rememberPassphrase)
	);
}
