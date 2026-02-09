import { formatJobPreview } from '@/shared/upwork';
import type { BuiltPrompt, UpworkJob, UserMindset } from './types';

export function buildPrompt(mindset: UserMindset, job: UpworkJob): BuiltPrompt {
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
		'proposals should be tailored to the job description and client needs, while following the style rules.',
		'never fabricate information. If the job description is missing details, simply state that in the proposal and suggest asking the client for clarification.',
		'If the job is a poor fit but has potential, suggest applying with a discovery proposal to clarify scope and requirements.',
		'DO NOT include words like "As an AI language model" in the proposal. Proposals should be written as if they are coming directly from the user.',
		'DO NOT address client as "Dear client" or "Dear hiring manager". Instead, start with their name (if available, like "Hello/Hi John") or with simple greetings ("Hi"/"Hello") and the proposal content.',
		'The short proposal is a concise version (1-2 sentences with new line break and greetings like the full proposal), while the full proposal is more detailed.',
	].join('\n');

	const input = [
		'Analyze this Upwork job and produce the JSON output schema exactly.',
		'',
		formatJobPreview(job),
	].join('\n');

	return { instructions, input };
}
