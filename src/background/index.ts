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
import {
	clampNumber,
	isArrayOfType,
	isBoolean,
	isNumber,
	isObject,
	isString,
} from 'nhb-toolbox';
import { Cipher } from 'nhb-toolbox/hash';

const JOB_URL_PATTERNS = [
	'https://www.upwork.com/jobs/*',
	'https://www.upwork.com/nx/find-work/details/*',
	'https://www.upwork.com/nx/find-work/best-matches/details/*',
	'https://www.upwork.com/nx/find-work/most-recent/details/*',
	'https://www.upwork.com/nx/find-work/*/details/*',
];

const JOB_URL_REGEX = /upwork\.com\/(jobs\/|nx\/find-work\/(.*\/)?details\/)/;

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
			model: 'gemini-2.5-flash',
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
		experience: '2+ years',
		location: 'Bangladesh',
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
			'Vue.js',
			'Vite',
			'Mongoose',
			'NestJS',
			'Zod',
			'Docusaurus',
			'Prisma',
			'Drizzle',
		],
		noGoSkills: [
			'Figma UI/UX design',
			'WordPress page builders',
			'PHP, Laravel and any other non-JavaScript backend/frontend',
			'Mobile app development (React Native, Flutter, etc.)',
		],
		proposalStyleRules: [
			'Be short and direct. No fluff.',
			'Emphasize speed and precision with clear scope boundaries.',
			'Ask 3-6 targeted questions.',
			'If scope is vague, propose a small paid discovery first.',
			'For Vue.js jobs, avoid complex sites, accepts only landing pages, or similar simple projects.',
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
	// Do NOT set openPanelOnActionClick so the popup works normally.
	void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

	// Prime the cache for any already-open Upwork job tabs so the extension
	// works immediately without requiring a page refresh after install/update.
	void chrome.tabs.query({ url: JOB_URL_PATTERNS }).then((tabs) => {
		for (const tab of tabs) {
			if (tab.id != null) {
				void extractJobViaScripting(tab.id).then((job) => {
					if (job) jobByTabId.set(tab.id!, job);
				});
			}
		}
	});
});

// Clean up job cache when tabs are closed to prevent memory leaks
chrome.tabs.onRemoved.addListener((tabId) => {
	jobByTabId.delete(tabId);
});

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
	if (isContentSnapshotMessage(msg) && sender.tab?.id != null) {
		jobByTabId.set(sender.tab.id, msg.job);
		sendResponse({ ok: true });
		return false;
	}

	void handleMessage(msg as BgRequest)
		.then(sendResponse)
		.catch((error) => {
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

	if (request.type === 'EXTRACT_FROM_TAB') {
		const tabId = await getActiveTabId();
		if (tabId == null) {
			return { ok: false, error: 'No active tab found.' };
		}

		// Check URL first
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (!tab?.url || !JOB_URL_REGEX.test(tab.url)) {
			return {
				ok: false,
				error: 'Navigate to an Upwork job details page first.',
			};
		}

		const job = await extractJobViaScripting(tabId);
		if (job) {
			jobByTabId.set(tabId, job);
			return { ok: true, type: 'ACTIVE_JOB', job };
		}

		return {
			ok: false,
			error: 'Could not extract job data from this page. The page may still be loading — try again in a moment.',
		};
	}

	if (request.type === 'TEST_PROVIDER_CONNECTION') {
		const settings = (await loadSettings()) ?? DEFAULT_SETTINGS;
		const provider = settings.activeProvider;
		const providerConfig = settings.providers[provider];

		if (!providerConfig.apiKeyEncrypted) {
			return {
				ok: false,
				error: `No API key is set for ${provider}. Open extension Options to save one.`,
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
				error: `No API key is set for ${provider}. Open extension Options to save one.`,
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
	if (!isObject(value)) return false;

	return value.type === 'UPWORK_JOB_SNAPSHOT' && !!value.job;
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
	if (!isObject(value)) {
		throw new Error('Invalid AI output format.');
	}

	const shouldApply = asBoolean(value.shouldApply, 'shouldApply');
	const fitScore = clampNumber(asNumber(value.fitScore, 'fitScore'), 0, 100);

	return {
		shouldApply,
		fitScore,
		keyReasons: asStringArray(value.keyReasons, 'keyReasons'),
		risks: asStringArray(value.risks, 'risks'),
		questionsToAsk: asStringArray(value.questionsToAsk, 'questionsToAsk'),
		proposalShort: asString(value.proposalShort, 'proposalShort'),
		proposalFull: asString(value.proposalFull, 'proposalFull'),
		bidSuggestion:
			isString(value.bidSuggestion) && value.bidSuggestion.trim() ?
				value.bidSuggestion
			:	undefined,
	};
}

function asBoolean(value: unknown, field: string): boolean {
	if (!isBoolean(value)) {
		throw new Error(`AI output field ${field} must be boolean.`);
	}
	return value;
}

function asNumber(value: unknown, field: string): number {
	if (!isNumber(value)) {
		throw new Error(`AI output field ${field} must be a valid number.`);
	}
	return value;
}

function asString(value: unknown, field: string): string {
	if (!isString(value)) {
		throw new Error(`AI output field ${field} must be a string.`);
	}
	return value;
}

function asStringArray(value: unknown, field: string): string[] {
	if (!isArrayOfType(value, isString)) {
		throw new Error(`AI output field ${field} must be string[].`);
	}
	return value;
}

function decryptProviderKey(encrypted: string, passphrase: string): string | null {
	try {
		const cipher = new Cipher(passphrase);
		return cipher.decrypt(encrypted);
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Programmatic extraction via chrome.scripting.executeScript
// This bypasses the CRXJS content-script loader entirely, so it works even
// when the module-based content script fails to initialise.
// ---------------------------------------------------------------------------

async function extractJobViaScripting(tabId: number): Promise<UpworkJob | null> {
	try {
		const [frame] = await chrome.scripting.executeScript({
			target: { tabId },
			func: extractJobFromPageDOM,
		});

		const raw = frame?.result;
		if (isObject(raw) && isString(raw.title) && isString(raw.description)) {
			return raw;
		}
	} catch {
		// scripting.executeScript can fail if the tab is about:blank, etc.
	}

	return null;
}

/**
 * Self-contained extraction function injected into the page via
 * chrome.scripting.executeScript. It MUST NOT reference any outer-scope
 * variables — Chrome serialises the function body and runs it in isolation.
 */
function extractJobFromPageDOM(): UpworkJob {
	const normalizeSpace = (v: string, keepNewLine = false) => {
		return keepNewLine ? v.replace(/[ \t]+/g, ' ').trim() : v.replace(/\s+/g, ' ').trim();
	};

	const extractNuxtField = (field: string): string => {
		try {
			const el = document.querySelector('#__NUXT_DATA__');
			if (!el?.textContent) return '';
			const data: unknown[] = JSON.parse(el.textContent);
			for (let i = 0; i < data.length; i++) {
				if (data[i] === field) {
					for (let j = i + 1; j < Math.min(i + 5, data.length); j++) {
						const val = data[j];

						if (isString(val) && val.length > 3) return val;
					}
				}
			}
		} catch {
			/* ignore */
		}
		return '';
	};

	const content = document.querySelector('.job-details-content') as HTMLElement | null;
	const sidebar = content?.querySelector('.sidebar') as HTMLElement | null;

	// ---- Title ----
	const extractTitle = (): string => {
		const span = content?.querySelector('h4 span.flex-1') as HTMLElement | null;
		if (span) return normalizeSpace(span.innerText);
		const h4 = content?.querySelector('h4') as HTMLElement | null;
		if (h4) return normalizeSpace(h4.innerText);
		const n = extractNuxtField('title');
		if (n) return n;
		const h1 = document.querySelector('h1') as HTMLElement | null;
		if (h1) return normalizeSpace(h1.innerText);
		const cleaned = document.title.replace(/\s*[-|]\s*Upwork.*$/i, '').trim();
		return cleaned || 'Job title cannot be parsed!';
	};

	// ---- Posted date ----
	const extractPostedDate = (): string => {
		const el = content?.querySelector('.posted-on-line') as HTMLElement | null;
		if (el) {
			const t = normalizeSpace(el.innerText);
			// "Posted yesterday" or "Posted 2 hours ago"
			const m = t.match(/Posted\s+(.+)/i);
			if (m?.[1]) return m[1];
			return t;
		}
		return '';
	};

	// ---- Job location (Worldwide / U.S. only etc) ----
	const extractJobLocation = (): string => {
		// The location line is in .posted-on-line sibling or nearby
		const els = content?.querySelectorAll('.posted-on-line ~ div, .posted-on-line div');
		if (els) {
			for (const el of els) {
				const t = normalizeSpace((el as HTMLElement).innerText);
				if (t && /worldwide|domestic|u\.?s\.?\s*only|europe|asia|remote/i.test(t)) {
					return t;
				}
			}
		}
		// Try the posted-on-line itself which may contain a location paragraph
		const line = content?.querySelector('.posted-on-line') as HTMLElement | null;
		if (line) {
			const ps = line.querySelectorAll('p');
			for (const p of ps) {
				const t = normalizeSpace(p.innerText);
				if (/worldwide|domestic|u\.?s\.?\s*only|remote/i.test(t)) return t;
			}
		}
		return '';
	};

	// ---- Description ----
	const extractDescription = (): string => {
		for (const sel of [
			'[data-test="Description"]',
			'[data-test="job-description"]',
			'.job-description',
		]) {
			const el = (content ?? document).querySelector(sel) as HTMLElement | null;
			if (el) {
				const t = normalizeSpace(el.innerText, true);
				if (t.length > 20) return t;
			}
		}
		if (content) {
			const sec = content.querySelector('section') as HTMLElement | null;
			return normalizeSpace(sec ? sec.innerText : content.innerText, true);
		}
		return '';
	};

	// ---- Features list (budget, experience, project type etc) ----
	// Upwork uses a <ul class="features"> with <li> items each containing:
	//   <strong>$5.00</strong> ... <div class="description">Fixed-price</div>
	//   <strong>Intermediate</strong> ... <div class="description">Experience Level</div>
	const extractFeatures = () => {
		let budgetText = '';
		let experienceLevel = '';
		let projectType = '';

		// Features approach: look at <li> in the features list
		const featureItems = content?.querySelectorAll('ul.features li, .features li');
		if (featureItems) {
			for (const li of featureItems) {
				const descEl = li.querySelector('.description') as HTMLElement | null;
				const desc = descEl ? normalizeSpace(descEl.innerText).toLowerCase() : '';
				const strongEl = li.querySelector('strong') as HTMLElement | null;
				const value = strongEl ? normalizeSpace(strongEl.innerText) : '';

				if (desc.includes('fixed-price') || desc.includes('hourly')) {
					// Budget line: value is the amount, desc is the type
					budgetText =
						value ?
							`${value} (${normalizeSpace(descEl!.innerText)})`
						:	normalizeSpace(descEl!.innerText);
				} else if (desc.includes('experience level') || desc.includes('experience')) {
					experienceLevel = value || normalizeSpace(descEl!.innerText);
				}
			}
		}

		// Also check data-cy attributes as alternative selectors
		if (!budgetText) {
			const fpEl = content?.querySelector(
				'[data-cy="fixed-price"]'
			) as HTMLElement | null;
			const hrEl = content?.querySelector('[data-cy="hourly"]') as HTMLElement | null;
			const budgetLi = fpEl?.closest('li') ?? hrEl?.closest('li');
			if (budgetLi) {
				const strongEl = budgetLi.querySelector('strong') as HTMLElement | null;
				const descEl = budgetLi.querySelector('.description') as HTMLElement | null;
				const amount = strongEl ? normalizeSpace(strongEl.innerText) : '';
				const type = descEl ? normalizeSpace(descEl.innerText) : '';
				budgetText = amount ? `${amount} (${type})` : type;
			}
		}

		if (!experienceLevel) {
			const expEl = content?.querySelector('[data-cy="expertise"]') as HTMLElement | null;
			const expLi = expEl?.closest('li');
			if (expLi) {
				const strongEl = expLi.querySelector('strong') as HTMLElement | null;
				experienceLevel = strongEl ? normalizeSpace(strongEl.innerText) : '';
			}
		}

		// Project type: <strong>Project Type:</strong><span>One-time project</span>
		const segLists = content?.querySelectorAll('.segmentations li, ul.list-unstyled li');
		if (segLists) {
			for (const li of segLists) {
				const strongEl = li.querySelector('strong') as HTMLElement | null;
				const label = strongEl ? normalizeSpace(strongEl.innerText).toLowerCase() : '';
				if (label.includes('project type')) {
					const spanEl = li.querySelector('span') as HTMLElement | null;
					projectType = spanEl ? normalizeSpace(spanEl.innerText) : '';
				}
			}
		}

		return { budgetText, experienceLevel, projectType };
	};

	// ---- Skills ----
	const extractSkills = (): string[] | undefined => {
		// Primary: badges in .skills-list
		const badges = (content ?? document).querySelectorAll(
			'.skills-list .air3-badge, .skills-list .badge, [data-test="skill"]'
		);
		const tags: string[] = [];
		for (const el of badges) {
			// Get the deepest text which is inside .air3-line-clamp or direct text
			const clamp = el.querySelector('.air3-line-clamp') as HTMLElement | null;
			const text = normalizeSpace((clamp ?? (el as HTMLElement)).textContent ?? '');
			if (text) tags.push(text);
		}
		if (tags.length > 0) return [...new Set(tags)];

		// Fallback: regex from innerText
		const text = content?.innerText ?? '';
		const m = text.match(/Skills\s*[:\n]\s*([^\n]+)/i);
		if (m?.[1]) {
			const parts = m[1]
				.split(',')
				.map((p) => normalizeSpace(p))
				.filter(Boolean);
			if (parts.length) return [...new Set(parts)];
		}
		return undefined;
	};

	// ---- Activity on this job ----
	const extractActivity = () => {
		const result: Record<string, string> = {};
		const items = content?.querySelectorAll(
			'.client-activity-items .ca-item, .client-activity-items li'
		);
		if (items) {
			for (const li of items) {
				const titleEl = li.querySelector('.title, span.title') as HTMLElement | null;
				const valueEl = li.querySelector(
					'.value, span.value, div.value'
				) as HTMLElement | null;
				if (titleEl && valueEl) {
					const key = normalizeSpace(titleEl.innerText)
						.replace(/:$/, '')
						.toLowerCase();
					const val = normalizeSpace(valueEl.innerText);
					result[key] = val;
				}
			}
		}
		return result;
	};

	// ---- Bid range (inside a <h5><strong>) ----
	const extractBidRange = (): string => {
		const headings = content?.querySelectorAll('h5 strong, h5');
		if (headings) {
			for (const h of headings) {
				const t = normalizeSpace((h as HTMLElement).innerText);
				if (t.toLowerCase().includes('bid range'))
					return t.replace(/^bid range\s*[-–—]?\s*/i, '');
			}
		}
		return '';
	};

	// ---- Connects info (sidebar) ----
	const extractConnects = () => {
		let connectsRequired = '';
		let connectsAvailable = '';

		const connectsContainer = sidebar ?? content;
		if (connectsContainer) {
			const text = connectsContainer.innerText;
			// "Required Connects to submit a proposal: 13"
			const reqMatch = text.match(/[Send a proposal for|Required Connects].*?:\s*(\d+)/i);
			if (reqMatch) connectsRequired = reqMatch[1];
			// "Available Connects: 22"
			const availMatch = text.match(/Available Connects:\s*(\d+)/i);
			if (availMatch) connectsAvailable = availMatch[1];
		}

		return { connectsRequired, connectsAvailable };
	};

	// ---- About the client ----
	const extractClient = () => {
		const aboutClient = (sidebar ?? content)?.querySelector(
			'[data-test="about-client-container"], .cfe-ui-job-about-client'
		) as HTMLElement | null;

		if (!aboutClient) {
			// Fallback: try regex from sidebar/content text
			return {} as Record<string, string | boolean>;
		}

		const clientText = aboutClient.innerText;

		// Payment verified
		const clientPaymentVerified = /payment (method )?verified/i.test(clientText);

		// Rating
		let clientRating = '';
		const ratingEl = aboutClient.querySelector(
			'.air3-rating-value-text'
		) as HTMLElement | null;
		if (ratingEl) clientRating = normalizeSpace(ratingEl.innerText);

		// Review count: "4.95 of 391 reviews"
		let clientReviewCount = '';
		const reviewMatch = clientText.match(/([\d.]+)\s+of\s+([\d,]+)\s+reviews?/i);
		if (reviewMatch) clientReviewCount = `${reviewMatch[1]} of ${reviewMatch[2]} reviews`;

		// Client location: [data-qa="client-location"]
		let clientLocation = '';
		const locEl = aboutClient.querySelector(
			'[data-qa="client-location"]'
		) as HTMLElement | null;
		if (locEl) {
			const strongEl = locEl.querySelector('strong') as HTMLElement | null;
			clientLocation =
				strongEl ? normalizeSpace(strongEl.innerText) : normalizeSpace(locEl.innerText);
		}

		// Jobs posted: [data-qa="client-job-posting-stats"]
		let clientJobsPosted = '';
		let clientHireRate = '';
		let clientOpenJobs = '';
		const jobStatsEl = aboutClient.querySelector(
			'[data-qa="client-job-posting-stats"]'
		) as HTMLElement | null;
		if (jobStatsEl) {
			const strongText = normalizeSpace(
				jobStatsEl.querySelector('strong')?.innerText ?? ''
			);
			const jm = strongText.match(/([\d,]+)\s+jobs?\s+posted/i);
			if (jm) clientJobsPosted = jm[1];
			const divText = normalizeSpace(
				jobStatsEl.querySelector('div')?.innerText ?? jobStatsEl.innerText
			);
			const hm = divText.match(/([\d.]+%)\s+hire\s+rate/i);
			if (hm) clientHireRate = hm[1];
			const om = divText.match(/([\d,]+)\s+open\s+jobs?/i);
			if (om) clientOpenJobs = om[1];
		}

		// Total spent
		let clientTotalSpent = '';
		const spendEl = aboutClient.querySelector(
			'[data-qa="client-spend"]'
		) as HTMLElement | null;
		if (spendEl) {
			const sm = normalizeSpace(spendEl.innerText).match(
				/([$\d,.KkMm]+)\s*total\s*spent/i
			);
			if (sm) clientTotalSpent = sm[1];
		}

		// Hires
		let clientTotalHires = '';
		let clientActiveHires = '';
		const hiresEl = aboutClient.querySelector(
			'[data-qa="client-hires"]'
		) as HTMLElement | null;
		if (hiresEl) {
			const ht = normalizeSpace(hiresEl.innerText);
			const hMatch = ht.match(/([\d,]+)\s*hires?/i);
			if (hMatch) clientTotalHires = hMatch[1];
			const aMatch = ht.match(/([\d,]+)\s*active/i);
			if (aMatch) clientActiveHires = aMatch[1];
		}

		// Avg hourly rate
		let clientAvgHourlyRate = '';
		const rateEl = aboutClient.querySelector(
			'[data-qa="client-hourly-rate"]'
		) as HTMLElement | null;
		if (rateEl) {
			const rm = normalizeSpace(rateEl.innerText).match(/([$\d,.]+\/hr)/i);
			if (rm) clientAvgHourlyRate = rm[1];
		}

		// Total hours
		let clientTotalHours = '';
		const hoursEl = aboutClient.querySelector(
			'[data-qa="client-hours"]'
		) as HTMLElement | null;
		if (hoursEl) clientTotalHours = normalizeSpace(hoursEl.innerText);

		// Industry
		let clientIndustry = '';
		const indEl = aboutClient.querySelector(
			'[data-qa="client-company-profile-industry"]'
		) as HTMLElement | null;
		if (indEl) clientIndustry = normalizeSpace(indEl.innerText);

		// Company size
		let clientCompanySize = '';
		const sizeEl = aboutClient.querySelector(
			'[data-qa="client-company-profile-size"]'
		) as HTMLElement | null;
		if (sizeEl) clientCompanySize = normalizeSpace(sizeEl.innerText);

		// Member since
		let clientMemberSince = '';
		const memberEl = aboutClient.querySelector(
			'[data-qa="client-contract-date"]'
		) as HTMLElement | null;
		if (memberEl) {
			const mt = normalizeSpace(memberEl.innerText);
			const mm = mt.match(/Member since\s+(.+)/i);
			clientMemberSince = mm ? mm[1] : mt;
		}

		return {
			clientPaymentVerified,
			clientRating,
			clientReviewCount,
			clientLocation,
			clientJobsPosted,
			clientHireRate,
			clientOpenJobs,
			clientTotalSpent,
			clientTotalHires,
			clientActiveHires,
			clientAvgHourlyRate,
			clientTotalHours,
			clientIndustry,
			clientCompanySize,
			clientMemberSince,
		};
	};

	function extractPreferredQualifications(): string[] {
		const result: string[] = [];
		const items = content?.querySelectorAll<HTMLLIElement>('.qualification-items li');

		if (items) {
			for (const li of items) {
				result.push(normalizeSpace(li.innerText));
			}
		}

		return result;
	}

	function extractQuestionList(): string[] {
		const result: string[] = [];

		if (content) {
			const markerText =
				'You will be asked to answer the following questions when submitting a proposal';

			const markerP = [...content.querySelectorAll('p')].find((p) =>
				p.textContent?.includes(markerText)
			);

			if (!markerP) return [];

			const ol =
				markerP.nextElementSibling instanceof HTMLOListElement ?
					markerP.nextElementSibling
				:	(markerP.parentElement?.querySelector('ol') ?? null);

			if (!ol) return [];

			[...ol.querySelectorAll('li')].forEach((li) => {
				result.push(li.textContent?.trim().replace(/\s+/g, ' ') ?? '');
			});
		}

		return result;
	}

	const title = extractTitle();
	const description = extractDescription();
	const postedDate = extractPostedDate();
	const jobLocation = extractJobLocation();
	const { budgetText, experienceLevel, projectType } = extractFeatures();
	const skills = extractSkills();
	const activity = extractActivity();
	const bidRange = extractBidRange();
	const { connectsRequired, connectsAvailable } = extractConnects();
	const client = extractClient();
	const preferredQualifications = extractPreferredQualifications();
	const requiredQuestions = extractQuestionList();

	return {
		url: location.href,
		title,
		description:
			description.startsWith('Summary') ?
				description.replace('Summary\n', 'Job Description:\n')
			:	`Job Description:\n\n${description}`,
		postedDate: postedDate || undefined,
		jobLocation: jobLocation || undefined,
		budgetText: budgetText || undefined,
		experienceLevel: experienceLevel || undefined,
		projectType: projectType || undefined,
		skills,
		proposals: activity['proposals'] || undefined,
		lastViewedByClient: activity['last viewed by client'] || undefined,
		hires: activity['hires'] || undefined,
		interviewing: activity['interviewing'] || undefined,
		invitesSent: activity['invites sent'] || undefined,
		unansweredInvites: activity['unanswered invites'] || undefined,
		bidRange: bidRange || undefined,
		connectsRequired: connectsRequired || undefined,
		connectsAvailable: connectsAvailable || undefined,
		preferredQualifications:
			preferredQualifications.length > 0 ? preferredQualifications : undefined,
		requiredQuestions: requiredQuestions.length > 0 ? requiredQuestions : undefined,
		...client,
	};
}
