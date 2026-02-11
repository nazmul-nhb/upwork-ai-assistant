import { formatJobPreview } from '@/shared/upwork';
import type { BuiltPrompt, UpworkJob, UserMindset } from './types';

export function buildPrompt(mindset: UserMindset, job: UpworkJob, raw = false): BuiltPrompt {
	const instructions = [
		'You are an Upwork job application assistant.',
		raw ?
			'Return structured response. Wrap the short proposal and full proposal in separate code blocks so each has its own copy button. No extra text.'
		:	'Return STRICT JSON only. No markdown. No extra text.',
		'',
		'Your task: decide if the user should apply and draft proposals aligned with the user mindset.',
		'',
		`User profile name: ${mindset.profileName}`,
		`${mindset.profileName}'s Experience: ${mindset?.experience ?? '-'}`,
		`${mindset.profileName}'s Location: ${mindset?.location ?? '-'}`,
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
		'',
		'Fit score should be calculated out of 100 based on how well the job matches the user mindset, skills, and experience. 100 means perfect fit, 0 means no fit.',
		'Proposals should be tailored to the job description and client needs, while following the style rules.',
		'Never fabricate information. If the job description is missing details, simply state that in the proposal and suggest asking the client for clarification.',
		'If the job is a poor fit but has potential, suggest applying with a discovery proposal to clarify scope and requirements.',
		'DO NOT include words like "As an AI language model" in the proposal. Proposals must be written as if coming directly from the user. Avoid clichés and generic statements. Be specific. Use ONLY ASCII quotes: single quote (\' = U+0027) and double quote (" = U+0022). NEVER use smart/curly quotes (’, ‘, “, ”). Never use em dashes (—) or en dashes (–), use hyphens (-) instead.',
		'DO NOT address client as "Dear client" or "Dear hiring manager". Instead, start with their name (if available, like "Hello/Hi John") or with simple greetings ("Hi"/"Hello") and the proposal content.',
		'The short proposal is a concise version (1-2 sentences with new line break and greetings like the full proposal), while the full proposal is more detailed.',
	].join('\n');

	const input = [
		`Analyze this Upwork job and ${
			raw ?
				'produce a structured response. Wrap the short proposal and full proposal in separate code blocks so each has its own copy button. No extra text. The JSON shcema above for you to understand what I wnat, DO NOT PRODUCE JSON SHEMA, but include the fields from schema in the response in separate sections with clear labels in title case (fitScore -> Fit Score, keyReasons -> Key Reasons etc.), replace booleans with Yes/No.'
			:	'produce the JSON output schema exactly'
		}:`,
		'',
		formatJobPreview(job),
	].join('\n');

	return { instructions, input };
}
