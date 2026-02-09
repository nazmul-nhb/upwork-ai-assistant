import { isObject, isString } from 'nhb-toolbox';

/**
 * Calls OpenAI Responses API.
 * @param apiKey OpenAI API key.
 * @param model Model id (configurable).
 * @param instructions System/developer instructions.
 * @param input User input text.
 */
export async function callOpenAiJson(
	apiKey: string,
	model: string,
	instructions: string,
	input: string
): Promise<string> {
	const res = await fetch('https://api.openai.com/v1/responses', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model,
			instructions,
			input,
			// Encourage JSON-only output (we also hard-enforce with strict parsing in background)
			text: { format: { type: 'text' } },
			temperature: 0.2,
			max_output_tokens: 1200,
		}),
	});

	if (!res.ok) {
		const msg = await safeReadText(res);
		throw new Error(`OpenAI API error (${res.status}): ${msg}`);
	}

	const data = (await res.json()) as unknown;

	// Official SDK exposes `response.output_text`. The raw REST response includes something similar.
	// We'll support both patterns defensively.
	const outputText = extractOutputText(data);
	return outputText;
}

/** @param res Fetch Response */
async function safeReadText(res: Response): Promise<string> {
	try {
		return await res.text();
	} catch {
		return 'Failed to read error body.';
	}
}

/** @param v Unknown API response */
function extractOutputText(v: unknown): string {
	if (!isObject(v)) throw new Error('Unexpected OpenAI response.');

	const direct = v.output_text;
	if (isString(direct)) return direct;

	// Fallback: attempt to stitch output[].content[].text
	const out = v.output;
	if (!Array.isArray(out)) throw new Error('OpenAI response missing output_text/output.');

	let acc = '';
	for (const item of out) {
		if (!isObject(item)) continue;

		const content = item.content;
		if (!Array.isArray(content)) continue;
		for (const c of content) {
			if (!isObject(c)) continue;
			const co = c;
			const text = co.text;
			if (isString(text)) acc += text;
			// Some variants: { type:"output_text", text:"..." }
			if (isString(co.type) && co.type.includes('text') && isString(co.text)) {
				acc += co.text;
			}
		}
	}
	if (acc.trim().length === 0)
		throw new Error('Could not extract model text from OpenAI response.');
	return acc;
}
