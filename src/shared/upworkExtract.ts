import type { UpworkJob } from './types';

export function extractUpworkJobFromDom(url: string): UpworkJob {
	const content = document.querySelector('.job-details-content') as HTMLElement | null;

	const title = extractTitle(content);
	const description = extractDescription(content);

	const budgetText =
		findLabeledValue(content, ['Budget', 'Hourly Range', 'Fixed-price']) || undefined;
	const experienceLevel =
		findLabeledValue(content, ['Experience level', 'Experience Level']) || undefined;
	const projectType =
		findLabeledValue(content, ['Project type', 'Project Type']) || undefined;

	return {
		url,
		title,
		description,
		budgetText,
		experienceLevel,
		projectType,
		skills: extractSkills(content),
		clientLocation: findLabeledValue(content, ['Location']) || undefined,
		clientHistorySummary: extractClientHistorySummary(content) || undefined,
	};
}

/** Try multiple selectors in priority order to find the job title. */
function extractTitle(content: HTMLElement | null): string {
	// 1. Exact Upwork selector: h4 > span.flex-1 inside job details card
	const titleSpan = content?.querySelector('h4 span.flex-1') as HTMLElement | null;
	if (titleSpan) return normalizeSpace(titleSpan.innerText);

	// 2. h4 inside job-details-content
	const h4 = content?.querySelector('h4') as HTMLElement | null;
	if (h4) return normalizeSpace(h4.innerText);

	// 3. Look in the Nuxt SSR data for the title
	const nuxtTitle = extractFromNuxtData('title');
	if (nuxtTitle) return nuxtTitle;

	// 4. Fall back to the first h1 on the page
	const h1 = document.querySelector('h1') as HTMLElement | null;
	if (h1) return normalizeSpace(h1.innerText);

	// 5. Try document title (usually contains the job title)
	if (document.title) {
		const cleaned = document.title.replace(/\s*[-|]\s*Upwork.*$/i, '').trim();
		if (cleaned) return cleaned;
	}

	return 'Job title cannot be parsed!';
}

/** Extract description from multiple possible containers. */
function extractDescription(content: HTMLElement | null): string {
	const selectors = [
		'[data-test="Description"]',
		'[data-test="job-description"]',
		'.job-description',
	];

	for (const selector of selectors) {
		const el = (content ?? document).querySelector(selector) as HTMLElement | null;
		if (el) {
			const text = normalizeSpace(el.innerText);
			if (text.length > 20) return text;
		}
	}

	// Fall back to the primary section text
	if (content) {
		const section = content.querySelector('section') as HTMLElement | null;
		if (section) return normalizeSpace(section.innerText);
		return normalizeSpace(content.innerText);
	}

	return '';
}

/** Try to extract a value from the embedded __NUXT_DATA__ script. */
function extractFromNuxtData(field: string): string {
	try {
		const script = document.querySelector('#__NUXT_DATA__');
		if (!script?.textContent) return '';
		const data = JSON.parse(script.textContent) as unknown[];
		// The Nuxt data is a flat array; look for the job title which follows
		// "Frontend Developer Leaderboard" pattern — we search for strings
		// that look like titles near the known index pattern.
		for (let i = 0; i < data.length; i++) {
			if (typeof data[i] === 'string' && data[i] === field) {
				// Field name found; the value is usually the next meaningful string
				for (let j = i + 1; j < Math.min(i + 5, data.length); j++) {
					if (typeof data[j] === 'string' && (data[j] as string).length > 3) {
						return data[j] as string;
					}
				}
			}
		}
	} catch {
		// Ignore parse errors
	}
	return '';
}

function normalizeSpace(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function findLabeledValue(content: HTMLElement | null, labels: string[]): string {
	const text = content?.innerText ?? '';
	if (!text) return '';
	for (const label of labels) {
		const regex = new RegExp(`${escapeRegex(label)}\\s*[:\\n]\\s*([^\\n]+)`, 'i');
		const match = text.match(regex);
		if (match?.[1]) return normalizeSpace(match[1]);
	}
	return '';
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSkills(content: HTMLElement | null): string[] | undefined {
	const root = content ?? document;
	const tags = Array.from(root.querySelectorAll('[data-test="skill"]'))
		.map((element) => normalizeSpace(element.textContent ?? ''))
		.filter(Boolean);

	if (tags.length > 0) return Array.from(new Set(tags));

	const text = content?.innerText ?? '';
	const match = text.match(/Skills\s*[:\n]\s*([^\n]+)/i);
	if (!match?.[1]) return undefined;

	const parts = match[1]
		.split(',')
		.map((part) => normalizeSpace(part))
		.filter(Boolean);

	return parts.length > 0 ? Array.from(new Set(parts)) : undefined;
}

function extractClientHistorySummary(content: HTMLElement | null): string {
	const text = content?.innerText ?? '';
	if (!text) return '';

	const lines = text
		.split('\n')
		.map((line) => normalizeSpace(line))
		.filter(Boolean);

	const index = lines.findIndex((line) => /client|history|reviews|spent|hires/i.test(line));
	if (index < 0) return '';

	return lines.slice(index, index + 6).join(' | ');
}
