import { isString, trimString, truncateString } from 'nhb-toolbox';
import type { UpworkJob } from './types';

export function extractUpworkJobFromDom(url: string): UpworkJob {
	const content = document.querySelector('.job-details-content') as HTMLElement | null;
	const sidebar = content?.querySelector('.sidebar') as HTMLElement | null;

	const title = extractTitle(content);
	const description = extractDescription(content);

	const postedDate = extractPostedDate(content);
	const jobLocation = extractJobLocation(content);
	const { budgetText, experienceLevel, projectType } = extractFeatures(content);
	const skills = extractSkills(content);
	const activity = extractActivity(content);
	const bidRange = extractBidRange(content);
	const { connectsRequired, connectsAvailable } = extractConnects(sidebar ?? content);
	const client = extractClient(sidebar ?? content);

	return {
		url,
		title,
		description,
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
		...client,
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeSpace(value: string, keepNewLine = false): string {
	if (keepNewLine) {
		// Replace multiple spaces with a single space, but preserve new lines
		return value.replace(/[ \t]+/g, ' ').trim();
	}

	return trimString(value);
}

function extractTitle(content: HTMLElement | null): string {
	const span = content?.querySelector('h4 span.flex-1') as HTMLElement | null;
	if (span) return normalizeSpace(span.innerText);
	const h4 = content?.querySelector('h4') as HTMLElement | null;
	if (h4) return normalizeSpace(h4.innerText);
	const n = extractFromNuxtData('title');
	if (n) return n;
	const h1 = document.querySelector('h1') as HTMLElement | null;
	if (h1) return normalizeSpace(h1.innerText);
	const cleaned = document.title.replace(/\s*[-|]\s*Upwork.*$/i, '').trim();
	return cleaned || 'Job title cannot be parsed!';
}

function extractPostedDate(content: HTMLElement | null): string {
	const el = content?.querySelector('.posted-on-line') as HTMLElement | null;
	if (el) {
		const t = normalizeSpace(el.innerText);
		const m = t.match(/Posted\s+(.+)/i);
		if (m?.[1]) return m[1];
		return t;
	}
	return '';
}

function extractJobLocation(content: HTMLElement | null): string {
	const els = content?.querySelectorAll('.posted-on-line ~ div, .posted-on-line div');
	if (els) {
		for (const el of els) {
			const t = normalizeSpace((el as HTMLElement).innerText);
			if (t && /worldwide|domestic|u\.?s\.?\s*only|europe|asia|remote/i.test(t)) return t;
		}
	}
	const line = content?.querySelector('.posted-on-line') as HTMLElement | null;
	if (line) {
		const ps = line.querySelectorAll('p');
		for (const p of ps) {
			const t = normalizeSpace(p.innerText);
			if (/worldwide|domestic|u\.?s\.?\s*only|remote/i.test(t)) return t;
		}
	}
	return '';
}

function extractDescription(content: HTMLElement | null): string {
	for (const sel of [
		'[data-test="Description"]',
		'[data-test="job-description"]',
		'.job-description',
	]) {
		const el = (content ?? document).querySelector(sel) as HTMLElement | null;
		if (el) {
			const text = normalizeSpace(el.innerText, true);
			if (text.length > 20) return text;
		}
	}
	if (content) {
		const section = content.querySelector('section') as HTMLElement | null;
		if (section) return normalizeSpace(section.innerText, true);
		return normalizeSpace(content.innerText, true);
	}
	return '';
}

function extractFeatures(content: HTMLElement | null) {
	let budgetText = '';
	let experienceLevel = '';
	let projectType = '';

	const featureItems = content?.querySelectorAll('ul.features li, .features li');
	if (featureItems) {
		for (const li of featureItems) {
			const descEl = li.querySelector('.description') as HTMLElement | null;
			const desc = descEl ? normalizeSpace(descEl.innerText).toLowerCase() : '';
			const strongEl = li.querySelector('strong') as HTMLElement | null;
			const value = strongEl ? normalizeSpace(strongEl.innerText) : '';

			if (desc.includes('fixed-price') || desc.includes('hourly')) {
				budgetText =
					value ?
						`${value} (${normalizeSpace(descEl!.innerText)})`
					:	normalizeSpace(descEl!.innerText);
			} else if (desc.includes('experience level') || desc.includes('experience')) {
				experienceLevel = value || normalizeSpace(descEl!.innerText);
			}
		}
	}

	if (!budgetText) {
		const fpEl = content?.querySelector('[data-cy="fixed-price"]') as HTMLElement | null;
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
}

function extractSkills(content: HTMLElement | null): string[] | undefined {
	const badges = (content ?? document).querySelectorAll(
		'.skills-list .air3-badge, .skills-list .badge, [data-test="skill"]'
	);
	const tags: string[] = [];
	for (const el of badges) {
		const clamp = el.querySelector('.air3-line-clamp') as HTMLElement | null;
		const text = normalizeSpace((clamp ?? (el as HTMLElement)).textContent ?? '');
		if (text) tags.push(text);
	}
	if (tags.length > 0) return [...new Set(tags)];

	const text = content?.innerText ?? '';
	const match = text.match(/Skills\s*[:\n]\s*([^\n]+)/i);
	if (!match?.[1]) return undefined;
	const parts = match[1]
		.split(',')
		.map((p) => normalizeSpace(p))
		.filter(Boolean);
	return parts.length > 0 ? [...new Set(parts)] : undefined;
}

function extractActivity(content: HTMLElement | null): Record<string, string> {
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
				const key = normalizeSpace(titleEl.innerText).replace(/:$/, '').toLowerCase();
				const val = normalizeSpace(valueEl.innerText);
				result[key] = val;
			}
		}
	}
	return result;
}

function extractBidRange(content: HTMLElement | null): string {
	const headings = content?.querySelectorAll('h5 strong, h5');
	if (headings) {
		for (const h of headings) {
			const t = normalizeSpace((h as HTMLElement).innerText);
			if (t.toLowerCase().includes('bid range'))
				return t.replace(/^bid range\s*[-–—]?\s*/i, '');
		}
	}
	return '';
}

function extractConnects(container: HTMLElement | null) {
	let connectsRequired = '';
	let connectsAvailable = '';
	if (container) {
		const text = container.innerText;
		const reqMatch = text.match(/Send a proposal for|Required Connects.*?:\s*(\d+)/i);
		if (reqMatch) connectsRequired = reqMatch[1];
		const availMatch = text.match(/Available Connects:\s*(\d+)/i);
		if (availMatch) connectsAvailable = availMatch[1];
	}
	return { connectsRequired, connectsAvailable };
}

function extractClient(container: HTMLElement | null) {
	const aboutClient = container?.querySelector(
		'[data-test="about-client-container"], .cfe-ui-job-about-client'
	) as HTMLElement | null;

	if (!aboutClient) return {};

	const clientText = aboutClient.innerText;
	const clientPaymentVerified = /payment (method )?verified/i.test(clientText);

	const ratingEl = aboutClient.querySelector('.air3-rating-value-text') as HTMLElement | null;
	const clientRating = ratingEl ? normalizeSpace(ratingEl.innerText) : '';

	const reviewMatch = clientText.match(/([\d.]+)\s+of\s+([\d,]+)\s+reviews?/i);
	const clientReviewCount =
		reviewMatch ? `${reviewMatch[1]} of ${reviewMatch[2]} reviews` : '';

	const locEl = aboutClient.querySelector(
		'[data-qa="client-location"]'
	) as HTMLElement | null;
	const clientLocation =
		locEl ?
			normalizeSpace(locEl.querySelector('strong')?.innerText ?? locEl.innerText)
		:	'';

	const jobStatsEl = aboutClient.querySelector(
		'[data-qa="client-job-posting-stats"]'
	) as HTMLElement | null;
	let clientJobsPosted = '';
	let clientHireRate = '';
	let clientOpenJobs = '';
	if (jobStatsEl) {
		const st = normalizeSpace(jobStatsEl.querySelector('strong')?.innerText ?? '');
		const jm = st.match(/([\d,]+)\s+jobs?\s+posted/i);
		if (jm) clientJobsPosted = jm[1];
		const dt = normalizeSpace(
			jobStatsEl.querySelector('div')?.innerText ?? jobStatsEl.innerText
		);
		const hm = dt.match(/([\d.]+%)\s+hire\s+rate/i);
		if (hm) clientHireRate = hm[1];
		const om = dt.match(/([\d,]+)\s+open\s+jobs?/i);
		if (om) clientOpenJobs = om[1];
	}

	const spendEl = aboutClient.querySelector('[data-qa="client-spend"]') as HTMLElement | null;
	let clientTotalSpent = '';
	if (spendEl) {
		const sm = normalizeSpace(spendEl.innerText).match(/([$\d,.KkMm]+)\s*total\s*spent/i);
		if (sm) clientTotalSpent = sm[1];
	}

	const hiresEl = aboutClient.querySelector('[data-qa="client-hires"]') as HTMLElement | null;
	let clientTotalHires = '';
	let clientActiveHires = '';
	if (hiresEl) {
		const ht = normalizeSpace(hiresEl.innerText);
		const hMatch = ht.match(/([\d,]+)\s*hires?/i);
		if (hMatch) clientTotalHires = hMatch[1];
		const aMatch = ht.match(/([\d,]+)\s*active/i);
		if (aMatch) clientActiveHires = aMatch[1];
	}

	const rateEl = aboutClient.querySelector(
		'[data-qa="client-hourly-rate"]'
	) as HTMLElement | null;
	const clientAvgHourlyRate =
		rateEl ? (normalizeSpace(rateEl.innerText).match(/([$\d,.]+\/hr)/i)?.[1] ?? '') : '';

	const hoursEl = aboutClient.querySelector('[data-qa="client-hours"]') as HTMLElement | null;
	const clientTotalHours = hoursEl ? normalizeSpace(hoursEl.innerText) : '';

	const indEl = aboutClient.querySelector(
		'[data-qa="client-company-profile-industry"]'
	) as HTMLElement | null;
	const clientIndustry = indEl ? normalizeSpace(indEl.innerText) : '';

	const sizeEl = aboutClient.querySelector(
		'[data-qa="client-company-profile-size"]'
	) as HTMLElement | null;
	const clientCompanySize = sizeEl ? normalizeSpace(sizeEl.innerText) : '';

	const memberEl = aboutClient.querySelector(
		'[data-qa="client-contract-date"]'
	) as HTMLElement | null;
	let clientMemberSince = '';
	if (memberEl) {
		const mt = normalizeSpace(memberEl.innerText);
		const mm = mt.match(/Member since\s+(.+)/i);
		clientMemberSince = mm ? mm[1] : mt;
	}

	return {
		clientPaymentVerified: clientPaymentVerified || undefined,
		clientRating: clientRating || undefined,
		clientReviewCount: clientReviewCount || undefined,
		clientLocation: clientLocation || undefined,
		clientJobsPosted: clientJobsPosted || undefined,
		clientHireRate: clientHireRate || undefined,
		clientOpenJobs: clientOpenJobs || undefined,
		clientTotalSpent: clientTotalSpent || undefined,
		clientTotalHires: clientTotalHires || undefined,
		clientActiveHires: clientActiveHires || undefined,
		clientAvgHourlyRate: clientAvgHourlyRate || undefined,
		clientTotalHours: clientTotalHours || undefined,
		clientIndustry: clientIndustry || undefined,
		clientCompanySize: clientCompanySize || undefined,
		clientMemberSince: clientMemberSince || undefined,
	};
}

function extractFromNuxtData(field: string): string {
	try {
		const script = document.querySelector('#__NUXT_DATA__');
		if (!script?.textContent) return '';
		const data = JSON.parse(script.textContent) as unknown[];
		for (let i = 0; i < data.length; i++) {
			if (data[i] === field) {
				for (let j = i + 1; j < Math.min(i + 5, data.length); j++) {
					const val = data[j];

					if (isString(val) && val.length > 3) return val;
				}
			}
		}
	} catch {
		// Ignore parse errors
	}
	return '';
}

/** Helper to format a job into a human-readable preview string. */
export function formatJobPreview(job: UpworkJob): string {
	const lines: string[] = [
		`Title: ${job.title}`,
		job.postedDate ? `Posted: ${job.postedDate}` : '',
		job.jobLocation ? `Job location: ${job.jobLocation}` : '',
		job.budgetText ? `Budget: ${job.budgetText}` : '',
		job.experienceLevel ? `Experience: ${job.experienceLevel}` : '',
		job.projectType ? `Project type: ${job.projectType}` : '',
		job.skills?.length ? `Skills: ${job.skills.join(', ')}` : '',
		'',
		// Activity
		job.proposals ? `Proposals: ${job.proposals}` : '',
		job.lastViewedByClient ? `Last viewed by client: ${job.lastViewedByClient}` : '',
		job.hires ? `Hires: ${job.hires}` : '',
		job.interviewing ? `Interviewing: ${job.interviewing}` : '',
		job.invitesSent ? `Invites sent: ${job.invitesSent}` : '',
		job.unansweredInvites ? `Unanswered invites: ${job.unansweredInvites}` : '',
		job.bidRange ? `Bid range: ${job.bidRange}` : '',
		'',
		// Connects
		job.connectsRequired ? `Connects to submit: ${job.connectsRequired}` : '',
		job.connectsAvailable ? `Available connects: ${job.connectsAvailable}` : '',
		'',
		// Client info
		'Client Info:',
		job.clientPaymentVerified != null ?
			`Payment verified: ${job.clientPaymentVerified ? 'Yes' : 'No'}`
		:	'',
		job.clientRating ? `Client rating: ${job.clientRating}` : '',
		job.clientReviewCount ? `Reviews: ${job.clientReviewCount}` : '',
		job.clientLocation ? `Client location: ${job.clientLocation}` : '',
		job.clientJobsPosted ? `Jobs posted: ${job.clientJobsPosted}` : '',
		job.clientHireRate ? `Hire rate: ${job.clientHireRate}` : '',
		job.clientOpenJobs ? `Open jobs: ${job.clientOpenJobs}` : '',
		job.clientTotalSpent ? `Total spent: ${job.clientTotalSpent}` : '',
		job.clientTotalHires ?
			`Total hires: ${job.clientTotalHires}${job.clientActiveHires ? `, ${job.clientActiveHires} active` : ''}`
		:	'',
		job.clientAvgHourlyRate ? `Avg hourly rate paid: ${job.clientAvgHourlyRate}` : '',
		job.clientTotalHours ? `Total hours: ${job.clientTotalHours}` : '',
		job.clientIndustry ? `Industry: ${job.clientIndustry}` : '',
		job.clientCompanySize ? `Company size: ${job.clientCompanySize}` : '',
		job.clientMemberSince ? `Member since: ${job.clientMemberSince}` : '',
		'',
		// Description (truncated)
		truncateString(job.description, 2000),
	];

	// Collapse consecutive empty strings into one blank line
	const collapsed: string[] = [];
	let lastBlank = false;
	for (const line of lines) {
		if (line === '') {
			if (!lastBlank) collapsed.push('');
			lastBlank = true;
		} else {
			collapsed.push(line);
			lastBlank = false;
		}
	}
	return collapsed.join('\n').trim();
}
