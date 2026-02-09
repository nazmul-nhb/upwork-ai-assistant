import { callLlmJson, LlmProviderError } from '@/shared/llm';
import { buildPrompt } from '@/shared/prompt';
import { loadSettings, saveSettings } from '@/shared/storage';
import type {
	AnalysisResult,
	BgRequest,
	BgResponse,
	ContentSnapshotMessage,
	ExtensionSettings,
	UpworkJob,
} from '@/shared/types';
import { Cipher } from 'nhb-toolbox/hash';

const DEFAULT_SETTINGS: ExtensionSettings = {
	activeProvider: 'openai',
	rememberPassphrase: false,
	providers: {
		openai: {
			model: 'gpt-5.2',
			baseUrl: 'https://api.openai.com/v1/responses',
			temperature: 0.2,
			maxOutputTokens: 1400,
		},
		gemini: {
			model: 'gemini-2.5-pro',
			baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
			temperature: 0.2,
			maxOutputTokens: 2048,
		},
		grok: {
			model: 'grok-3-latest',
			baseUrl: 'https://api.x.ai/v1/chat/completions',
			temperature: 0.2,
			maxOutputTokens: 1400,
		},
	},
	mindset: {
		profileName: 'Nazmul Hassan',
		roleTitle: 'Full-stack Web Developer (React/TypeScript/Node.js)',
		coreSkills: [
			'JavaScript',
			'TypeScript',
			'React',
			'Next.js',
			'TailwindCSS',
			'Node.js',
			'Express.js',
			'MongoDB',
			'PostgreSQL',
			'REST APIs',
			'Debugging',
		],
		secondarySkills: [
			'Redux Toolkit',
			'TanStack Query',
			'Vite',
			'Mongoose',
			'Zod',
			'Docusaurus',
		],
		noGoSkills: [
			'Figma UI/UX design',
			'WordPress page builders',
			'Native mobile (Swift/Kotlin)',
		],
		proposalStyleRules: [
			'Be short and direct. No fluff.',
			'Emphasize speed and precision with clear scope boundaries.',
			'Ask 3-6 targeted questions.',
			'If scope is vague, propose a small paid discovery first.',
		],
		redFlags: [
			'Unrealistic deadlines with very low budget',
			'Vague scope with pressure to commit upfront',
			'Requests for free work or unpaid trials',
			'Suspicious links or credentials requests',
		],
	},
};

const jobByTabId = new Map<number, UpworkJob>();

chrome.runtime.onInstalled.addListener(() => {
	void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
	if (isContentSnapshotMessage(msg) && sender.tab?.id != null) {
		jobByTabId.set(sender.tab.id, msg.job);
		sendResponse({ ok: true });
		return false;
	}

	void handleMessage(msg as BgRequest)
		.then(sendResponse)
		.catch((error: unknown) => {
			if (error instanceof LlmProviderError) {
				sendResponse({
					ok: false,
					error: error.message,
					provider: error.provider,
					statusCode: error.statusCode,
					rawError: error.rawError,
				} satisfies BgResponse);
				return;
			}

			const message =
				error instanceof Error ? error.message : 'Unknown background error.';
			sendResponse({ ok: false, error: message } satisfies BgResponse);
		});

	return true;
});

async function handleMessage(request: BgRequest): Promise<BgResponse> {
	if (request.type === 'PING') {
		return { ok: true, type: 'PONG' };
	}

	if (request.type === 'GET_SETTINGS') {
		const settings = (await loadSettings()) ?? DEFAULT_SETTINGS;
		return { ok: true, type: 'SETTINGS', settings };
	}

	if (request.type === 'SET_SETTINGS') {
		await saveSettings(request.settings);
		return { ok: true, type: 'SAVED' };
	}

	if (request.type === 'GET_ACTIVE_JOB') {
		const activeTabId = await getActiveTabId();
		const job = activeTabId != null ? (jobByTabId.get(activeTabId) ?? null) : null;
		return { ok: true, type: 'ACTIVE_JOB', job };
	}

	if (request.type === 'TEST_PROVIDER_CONNECTION') {
		const settings = (await loadSettings()) ?? DEFAULT_SETTINGS;
		const provider = settings.activeProvider;
		const providerConfig = settings.providers[provider];

		if (!providerConfig.apiKeyEncrypted) {
			return {
				ok: false,
				error: `No API key is set for ${provider}. Save it in popup settings first.`,
			};
		}

		const passphrase = request.passphrase?.trim() ?? '';
		if (!passphrase) {
			return { ok: false, error: 'Passphrase is required to decrypt the saved API key.' };
		}

		const apiKey = decryptProviderKey(providerConfig.apiKeyEncrypted, passphrase);
		if (!apiKey) {
			return {
				ok: false,
				error: 'Failed to decrypt API key. Please verify your passphrase.',
			};
		}

		await callLlmJson({
			provider,
			apiKey,
			model: providerConfig.model,
			baseUrl: providerConfig.baseUrl,
			temperature: providerConfig.temperature,
			maxOutputTokens: Math.min(providerConfig.maxOutputTokens ?? 1400, 400),
			instructions:
				'You are a health check endpoint. Return STRICT JSON only: {"ok":true,"provider":"name"}',
			input: 'Perform a minimal connection verification.',
		});

		return {
			ok: true,
			type: 'CONNECTION_TEST',
			message: `${provider.toUpperCase()} connection succeeded.`,
		};
	}

	if (request.type === 'ANALYZE_JOB') {
		const settings = (await loadSettings()) ?? DEFAULT_SETTINGS;
		const provider = settings.activeProvider;
		const providerConfig = settings.providers[provider];

		if (!providerConfig.apiKeyEncrypted) {
			return {
				ok: false,
				error: `No API key is set for ${provider}. Save it in popup settings first.`,
			};
		}

		const passphrase = request.passphrase?.trim() ?? '';
		if (!passphrase) {
			return { ok: false, error: 'Passphrase is required to decrypt the saved API key.' };
		}

		const apiKey = decryptProviderKey(providerConfig.apiKeyEncrypted, passphrase);
		if (!apiKey) {
			return {
				ok: false,
				error: 'Failed to decrypt API key. Please verify your passphrase.',
			};
		}

		const { instructions, input } = buildPrompt(settings.mindset, request.job);
		const rawResponse = await callLlmJson({
			provider,
			apiKey,
			model: providerConfig.model,
			instructions,
			input,
			baseUrl: providerConfig.baseUrl,
			temperature: providerConfig.temperature,
			maxOutputTokens: providerConfig.maxOutputTokens,
		});

		let parsed: unknown;
		try {
			parsed = strictJsonObject(rawResponse);
		} catch {
			throw new LlmProviderError({
				provider,
				message:
					'Model output was not valid JSON. Try increasing Max output tokens or simplifying the prompt.',
				rawError: rawResponse,
			});
		}

		const result = coerceAnalysis(parsed);
		return { ok: true, type: 'ANALYSIS', result };
	}

	return { ok: false, error: 'Unknown request type.' };
}

async function getActiveTabId(): Promise<number | null> {
	const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
	return tabs[0]?.id ?? null;
}

function isContentSnapshotMessage(value: unknown): value is ContentSnapshotMessage {
	if (!value || typeof value !== 'object') return false;
	const obj = value as Record<string, unknown>;
	return obj.type === 'UPWORK_JOB_SNAPSHOT' && !!obj.job;
}

function strictJsonObject(text: string): unknown {
	const trimmed = text.trim();

	if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
		return JSON.parse(trimmed) as unknown;
	}

	const first = trimmed.indexOf('{');
	const last = trimmed.lastIndexOf('}');
	if (first !== -1 && last !== -1 && last > first) {
		return JSON.parse(trimmed.slice(first, last + 1)) as unknown;
	}

	throw new Error('The AI response did not contain valid JSON.');
}

function coerceAnalysis(value: unknown): AnalysisResult {
	if (!value || typeof value !== 'object') {
		throw new Error('Invalid AI output format.');
	}

	const object = value as Record<string, unknown>;
	const shouldApply = asBoolean(object.shouldApply, 'shouldApply');
	const fitScore = clamp(asNumber(object.fitScore, 'fitScore'), 0, 100);

	return {
		shouldApply,
		fitScore,
		keyReasons: asStringArray(object.keyReasons, 'keyReasons'),
		risks: asStringArray(object.risks, 'risks'),
		questionsToAsk: asStringArray(object.questionsToAsk, 'questionsToAsk'),
		proposalShort: asString(object.proposalShort, 'proposalShort'),
		proposalFull: asString(object.proposalFull, 'proposalFull'),
		bidSuggestion:
			typeof object.bidSuggestion === 'string' && object.bidSuggestion.trim() ?
				object.bidSuggestion
			:	undefined,
	};
}

function asBoolean(value: unknown, field: string): boolean {
	if (typeof value !== 'boolean') {
		throw new Error(`AI output field ${field} must be boolean.`);
	}
	return value;
}

function asNumber(value: unknown, field: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new Error(`AI output field ${field} must be a valid number.`);
	}
	return value;
}

function asString(value: unknown, field: string): string {
	if (typeof value !== 'string') {
		throw new Error(`AI output field ${field} must be a string.`);
	}
	return value;
}

function asStringArray(value: unknown, field: string): string[] {
	if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
		throw new Error(`AI output field ${field} must be string[].`);
	}
	return value;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function decryptProviderKey(encrypted: string, passphrase: string): string | null {
	try {
		const cipher = new Cipher(passphrase);
		return cipher.decrypt(encrypted);
	} catch {
		return null;
	}
}
