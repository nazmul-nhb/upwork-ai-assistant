import { isObject } from 'nhb-toolbox';
import type { AnalysisResult, BgRequest, BgResponse, UpworkJob } from '../shared/types';

let currentJob: UpworkJob | null = null;
let latestResult: AnalysisResult | null = null;

const $ = <T extends HTMLElement>(id: string): T => {
	const el = document.getElementById(id);
	if (!el) throw new Error(`Missing element: ${id}`);
	return el as T;
};

const jobTitleEl = $('jobTitle');
const jobPreviewEl = $('jobPreview');
const resultEl = $('result');
const passphraseEl = $('passphrase') as HTMLInputElement;

const btnRefresh = $('btnRefresh') as HTMLButtonElement;
const btnAnalyze = $('btnAnalyze') as HTMLButtonElement;
const btnCopyShort = $('btnCopyShort') as HTMLButtonElement;
const btnCopyFull = $('btnCopyFull') as HTMLButtonElement;

btnRefresh.addEventListener('click', () => void refreshFromActiveTab());
btnAnalyze.addEventListener('click', () => void analyze());
btnCopyShort.addEventListener('click', () => void copyProposal('short'));
btnCopyFull.addEventListener('click', () => void copyProposal('full'));

void refreshFromActiveTab();

async function refreshFromActiveTab(): Promise<void> {
	setBusy(true);
	try {
		const tab = await getActiveTab();
		if (!tab?.id) throw new Error('No active tab.');

		// Ask the content script to re-snapshot by re-injecting it if needed
		// (Content script already sends snapshots periodically)
		await delay(200);

		const job = await getJobSnapshotViaBg(tab.id);
		currentJob = job;
		latestResult = null;

		jobTitleEl.textContent = job.title;
		jobPreviewEl.textContent = formatJob(job);
		resultEl.textContent = 'Ready. Click Analyze.';
		resultEl.classList.add('muted');
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Unknown error';
		resultEl.textContent = msg;
		resultEl.classList.remove('muted');
	} finally {
		setBusy(false);
	}
}

async function analyze(): Promise<void> {
	setBusy(true);
	try {
		if (!currentJob) throw new Error('No job detected. Refresh first.');
		const passphrase = passphraseEl.value.trim();
		if (!passphrase) throw new Error('Passphrase required.');

		resultEl.textContent = 'Analyzing...';
		resultEl.classList.add('muted');

		const req: BgRequest = { type: 'ANALYZE_JOB', job: currentJob, passphrase };
		const res = (await chrome.runtime.sendMessage(req)) as BgResponse;

		if (!res.ok) throw new Error(res.error);

		if (res.type !== 'ANALYSIS') throw new Error('Unexpected response from background.');
		const r = res.result;
		latestResult = r;

		resultEl.textContent = renderResult(r);
		resultEl.classList.remove('muted');
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Unknown error';
		resultEl.textContent = msg;
		resultEl.classList.remove('muted');
	} finally {
		setBusy(false);
	}
}

async function copyProposal(kind: 'short' | 'full'): Promise<void> {
	if (!latestResult) return;
	await navigator.clipboard.writeText(
		kind === 'short' ? latestResult.proposalShort : latestResult.proposalFull
	);
}

function setBusy(b: boolean): void {
	btnRefresh.disabled = b;
	btnAnalyze.disabled = b;
	btnCopyShort.disabled = b;
	btnCopyFull.disabled = b;
}

function formatJob(job: UpworkJob): string {
	return [
		`Title: ${job.title}`,
		job.budgetText ? `Budget: ${job.budgetText}` : '',
		job.experienceLevel ? `Experience: ${job.experienceLevel}` : '',
		job.projectType ? `Project type: ${job.projectType}` : '',
		job.skills?.length ? `Skills: ${job.skills.join(', ')}` : '',
		'',
		job.description.slice(0, 1400) + (job.description.length > 1400 ? '\n...\n' : ''),
	]
		.filter(Boolean)
		.join('\n');
}

function renderResult(r: AnalysisResult): string {
	const lines: string[] = [];
	lines.push(`Apply: ${r.shouldApply ? 'YES' : 'NO'} | Fit score: ${r.fitScore}/100`);
	lines.push('');
	lines.push('Reasons:');
	for (const x of r.keyReasons) lines.push(`- ${x}`);
	lines.push('');
	lines.push('Risks:');
	for (const x of r.risks) lines.push(`- ${x}`);
	lines.push('');
	lines.push('Questions to ask:');
	for (const x of r.questionsToAsk) lines.push(`- ${x}`);
	if (r.bidSuggestion) {
		lines.push('');
		lines.push(`Bid suggestion: ${r.bidSuggestion}`);
	}
	lines.push('');
	lines.push('Proposal (short):');
	lines.push(r.proposalShort);
	lines.push('');
	lines.push('Proposal (full):');
	lines.push(r.proposalFull);
	return lines.join('\n');
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
	const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
	return tabs[0];
}

async function getJobSnapshotViaBg(tabId: number): Promise<UpworkJob> {
	// Ask background to read its cached snapshot for the active tab by pinging storage via a quick trick:
	// We'll execute a small script to return current DOM extraction directly.
	const [res] = await chrome.scripting.executeScript({
		target: { tabId },
		func: () => {
			// NOTE: duplicated minimal extraction to avoid import in executeScript scope
			const title =
				(document.querySelector('h1')?.textContent ?? '').trim() || 'Untitled job';
			const desc =
				(
					document.querySelector('[data-test="job-description-text"]')?.textContent ??
					''
				).trim() || document.body.innerText.slice(0, 20_000);
			return { title, desc, url: location.href };
		},
	});

	const v = res?.result as unknown;
	if (!isObject(v)) throw new Error('Could not read job page.');

	return {
		url: String(v.url ?? ''),
		title: String(v.title ?? 'Untitled job'),
		description: String(v.desc ?? ''),
	};
}

function delay(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}
