import type { BgRequest, BgResponse, ExtensionSettings, AnalysisResult } from "../shared/types";
import { loadSettings, saveSettings } from "../shared/storage";
import { decryptSecret } from "../shared/crypto";
import { buildPrompt } from "../shared/prompt";
import { callOpenAiJson } from "../shared/openai";

const DEFAULT_SETTINGS: ExtensionSettings = {
  provider: "openai",
  rememberPassphrase: false,
  mindset: {
    profileName: "Nazmul",
    roleTitle: "Full-stack Web Developer (React/TS/Node)",
    coreSkills: ["TypeScript", "React", "Next.js", "TailwindCSS", "Node.js", "Express.js", "MongoDB", "REST APIs", "Debugging"],
    secondarySkills: ["Redux Toolkit", "TanStack Query", "Vite", "Mongoose", "Zod", "Docusaurus"],
    noGoSkills: ["Figma UI/UX design", "WordPress page builders", "Native mobile (Swift/Kotlin)"],
    proposalStyleRules: [
      "Be short and direct. No fluff.",
      "Emphasize speed + precision + bug-fixing discipline.",
      "Ask 3-6 targeted questions.",
      "If scope is vague, propose a lightweight triage first."
    ],
    redFlags: [
      "Unrealistic deadlines with low budget",
      "Vague scope + wants 'everything' fixed without details",
      "Asks for free work or unpaid trials",
      "Suspicious links or requests for credentials"
    ],
    defaultModel: "gpt-5.2"
  }
};

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((msg: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
  // Receive job snapshot from content script
  const isSnapshot =
    !!msg &&
    typeof msg === "object" &&
    (msg as Record<string, unknown>).type === "UPWORK_JOB_SNAPSHOT";

  void isSnapshot;

  sendResponse(undefined);
  return false;
});

chrome.runtime.onMessage.addListener((req: BgRequest, _sender: chrome.runtime.MessageSender, sendResponse: (r: BgResponse) => void) => {
  void handle(req).then(sendResponse);
  return true;
});

async function handle(req: BgRequest): Promise<BgResponse> {
  try {
    if (req.type === "PING") return { ok: true, type: "PONG" };

    if (req.type === "GET_SETTINGS") {
      const s = (await loadSettings()) ?? DEFAULT_SETTINGS;
      return { ok: true, type: "SETTINGS", settings: s };
    }

    if (req.type === "SET_SETTINGS") {
      await saveSettings(req.settings);
      return { ok: true, type: "SAVED" };
    }

    if (req.type === "ANALYZE_JOB") {
      const settings = (await loadSettings()) ?? DEFAULT_SETTINGS;

      if (!settings.openaiApiKey) {
        return { ok: false, error: "No API key saved. Open Options and set your OpenAI API key." };
      }

      const passphrase = req.passphrase?.trim() ?? "";
      if (passphrase.length === 0) {
        return { ok: false, error: "Passphrase is required to decrypt the API key (not stored by default)." };
      }

      const apiKey = await decryptSecret(settings.openaiApiKey, passphrase);

      const { instructions, input } = buildPrompt(settings.mindset, req.job);

      const raw = await callOpenAiJson(apiKey, settings.mindset.defaultModel, instructions, input);

      const json = strictJsonObject(raw);
      const result = coerceAnalysis(json);

      return { ok: true, type: "ANALYSIS", result };
    }

    return { ok: false, error: "Unknown request." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

/** @param s model output */
function strictJsonObject(s: string): unknown {
  // If model adds leading/trailing text, try to salvage the first {...} block.
  const trimmed = s.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return JSON.parse(trimmed) as unknown;
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    const slice = trimmed.slice(first, last + 1);
    return JSON.parse(slice) as unknown;
  }

  throw new Error("Model did not return JSON.");
}

/** @param v unknown */
function coerceAnalysis(v: unknown): AnalysisResult {
  if (!v || typeof v !== "object") throw new Error("Invalid JSON output.");
  const o = v as Record<string, unknown>;

  const shouldApply = asBool(o.shouldApply);
  const fitScore = asNumber(o.fitScore);

  const keyReasons = asStringArray(o.keyReasons);
  const risks = asStringArray(o.risks);
  const questionsToAsk = asStringArray(o.questionsToAsk);

  const proposalShort = asString(o.proposalShort);
  const proposalFull = asString(o.proposalFull);
  const bidSuggestion = typeof o.bidSuggestion === "string" ? o.bidSuggestion : undefined;

  return {
    shouldApply,
    fitScore: clamp(fitScore, 0, 100),
    keyReasons,
    risks,
    questionsToAsk,
    proposalShort,
    proposalFull,
    bidSuggestion
  };
}

function asBool(v: unknown): boolean {
  if (typeof v !== "boolean") throw new Error("shouldApply must be boolean");
  return v;
}
function asNumber(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("fitScore must be a number");
  return v;
}
function asString(v: unknown): string {
  if (typeof v !== "string") throw new Error("proposal fields must be string");
  return v;
}
function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw new Error("Array fields must be string[]");
  return v;
}
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
