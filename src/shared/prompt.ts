import type { UpworkJob, UserMindset } from './types';

export function buildPrompt(
	mindset: UserMindset,
	job: UpworkJob
): { instructions: string; input: string } {
	const instructions = [
		'You are an Upwork job application assistant.',
		'Return STRICT JSON only. No markdown. No extra text.',
		'',
		'Your task: decide if the user should apply and draft proposals aligned with the user mindset.',
		'',
		`User profile name: ${mindset.profileName}`,
		`Role title: ${mindset.roleTitle}`,
		`Core skills: ${mindset.coreSkills.join(', ')}`,
		`Secondary skills: ${mindset.secondarySkills.join(', ')}`,
		`No-go skills (if heavily required then recommend SKIP): ${mindset.noGoSkills.join(', ')}`,
		'',
		'Proposal style rules:',
		...mindset.proposalStyleRules.map((rule) => `- ${rule}`),
		'',
		'Red flags to watch for:',
		...mindset.redFlags.map((flag) => `- ${flag}`),
		'',
		'Output JSON schema:',
		'{',
		'  "shouldApply": boolean,',
		'  "fitScore": number,',
		'  "keyReasons": string[],',
		'  "risks": string[],',
		'  "questionsToAsk": string[],',
		'  "proposalShort": string,',
		'  "proposalFull": string,',
		'  "bidSuggestion": string',
		'}',
	].join('\n');

	const input = [
		'Analyze this Upwork job and produce the JSON output schema exactly.',
		'',
		`URL: ${job.url}`,
		`Title: ${job.title}`,
		job.budgetText ? `Budget: ${job.budgetText}` : '',
		job.experienceLevel ? `Experience: ${job.experienceLevel}` : '',
		job.projectType ? `Project type: ${job.projectType}` : '',
		job.skills?.length ? `Skills: ${job.skills.join(', ')}` : '',
		job.clientLocation ? `Client location: ${job.clientLocation}` : '',
		job.clientHistorySummary ? `Client history: ${job.clientHistorySummary}` : '',
		'',
		'Description:',
		job.description,
	]
		.filter((line) => line.trim().length > 0)
		.join('\n');

	return { instructions, input };
}
