import type { UpworkJob } from './types';

const content = document.querySelector('.job-details-content') as HTMLDivElement;

export function extractUpworkJobFromDom(url: string): UpworkJob {
	const title =
		textFrom('.job-details-content h4') || textFrom('h1') || 'Job title cannot be parsed!';

	console.log(title);

	const description =
		textFrom('[data-test="Description"]') ||
		textFrom('[data-test="job-description"]') ||
		textFrom('section') ||
		content.innerText;

	const budgetText = findLabeledValue(['Budget', 'Hourly Range', 'Fixed-price']) || undefined;
	const experienceLevel =
		findLabeledValue(['Experience level', 'Experience Level']) || undefined;
	const projectType = findLabeledValue(['Project type', 'Project Type']) || undefined;

	return {
		url,
		title,
		description,
		budgetText,
		experienceLevel,
		projectType,
		skills: extractSkills(),
		clientLocation: findLabeledValue(['Location']) || undefined,
		clientHistorySummary: extractClientHistorySummary() || undefined,
	};
}

function textFrom(selector: string): string {
	const element = document.querySelector(selector) as HTMLElement;
	return normalizeSpace(element?.innerText?.trim() ?? '');
}

function normalizeSpace(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function findLabeledValue(labels: string[]): string {
	const text = content.innerText;
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

function extractSkills(): string[] | undefined {
	const tags = Array.from(content.querySelectorAll('[data-test="skill"]'))
		.map((element) => normalizeSpace(element.textContent ?? ''))
		.filter(Boolean);

	if (tags.length > 0) return Array.from(new Set(tags));

	const text = content.innerText;
	const match = text.match(/Skills\s*[:\n]\s*([^\n]+)/i);
	if (!match?.[1]) return undefined;

	const parts = match[1]
		.split(',')
		.map((part) => normalizeSpace(part))
		.filter(Boolean);

	return parts.length > 0 ? Array.from(new Set(parts)) : undefined;
}

function extractClientHistorySummary(): string {
	const lines = content.innerText
		.split('\n')
		.map((line) => normalizeSpace(line))
		.filter(Boolean);

	const index = lines.findIndex((line) => /client|history|reviews|spent|hires/i.test(line));
	if (index < 0) return '';

	return lines.slice(index, index + 6).join(' | ');
}
