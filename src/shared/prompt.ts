import { formatJobPreview } from '@/shared/upwork';
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
		'fitScore should be calculated out of 100 based on how well the job matches the user mindset, skills, and experience. 100 means perfect fit, 0 means no fit.',
	].join('\n');

	const input = [
		'Analyze this Upwork job and produce the JSON output schema exactly.',
		'',
		formatJobPreview(job),
	].join('\n');

	return { instructions, input };
}
