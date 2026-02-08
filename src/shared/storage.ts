import type { ExtensionSettings } from "./types";

const KEY = "UPWORK_AI_ASSISTANT_SETTINGS_V1";

export async function loadSettings(): Promise<ExtensionSettings | null> {
  const data = await chrome.storage.local.get(KEY);
  const v = data[KEY] as unknown;
  return isSettings(v) ? v : null;
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: settings });
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isSettings(v: unknown): v is ExtensionSettings {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (o.provider !== "openai") return false;
  const mindset = o.mindset as unknown;
  if (!mindset || typeof mindset !== "object") return false;

  const m = mindset as Record<string, unknown>;
  return (
    typeof m.profileName === "string" &&
    typeof m.roleTitle === "string" &&
    isStringArray(m.coreSkills) &&
    isStringArray(m.secondarySkills) &&
    isStringArray(m.noGoSkills) &&
    isStringArray(m.proposalStyleRules) &&
    isStringArray(m.redFlags) &&
    typeof m.defaultModel === "string" &&
    typeof o.rememberPassphrase === "boolean"
  );
}
