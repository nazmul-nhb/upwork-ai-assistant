import {
	clampNumber,
	isNumber,
	isObject,
	isObjectWithKeys,
	isPositiveInteger,
	isString,
} from 'nhb-toolbox';
import type { LlmProvider } from './types';

export type LlmRequest = {
	provider: LlmProvider;
	apiKey: string;
	model: string;
	instructions: string;
	input: string;
	baseUrl?: string;
	temperature?: number;
	maxOutputTokens?: number;
};

export class LlmProviderError extends Error {
	provider: LlmProvider;
	statusCode?: number;
	rawError?: string;

	constructor(params: {
		provider: LlmProvider;
		message: string;
		statusCode?: number;
		rawError?: string;
	}) {
		super(params.message);
		this.name = 'LlmProviderError';
		this.provider = params.provider;
		this.statusCode = params.statusCode;
		this.rawError = params.rawError;
	}
}

export async function callLlmJson(request: LlmRequest): Promise<string> {
	switch (request.provider) {
		case 'openai':
			return callOpenAI(request);
		case 'gemini':
			return callGemini(request);
		case 'grok':
			return callGrok(request);
		default:
			throw new Error(
				`Unsupported provider: ${(request as { provider: string }).provider}`
			);
	}
}

async function callOpenAI(request: LlmRequest): Promise<string> {
	const endpoint = request.baseUrl?.trim() || 'https://api.openai.com/v1/responses';

	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${request.apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: request.model,
			instructions: request.instructions,
			input: request.input,
			text: { format: { type: 'text' } },
			temperature: normalizeTemperature(request.temperature, 0.2),
			max_output_tokens: normalizeMaxOutputTokens(request.maxOutputTokens, 1400),
		}),
	});

	if (!response.ok) {
		const raw = await safeReadText(response);
		throw new LlmProviderError({
			provider: 'openai',
			statusCode: response.status,
			rawError: raw,
			message: `OpenAI error (${response.status})`,
		});
	}

	const data = (await response.json()) as unknown;
	return extractOpenAiText(data);
}

async function callGemini(request: LlmRequest): Promise<string> {
	const base = request.baseUrl?.trim() || 'https://generativelanguage.googleapis.com/v1beta';
	const endpoint = `${base.replace(/\/$/, '')}/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(request.apiKey)}`;

	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			systemInstruction: {
				parts: [{ text: request.instructions }],
			},
			contents: [{ parts: [{ text: request.input }] }],
			generationConfig: {
				temperature: normalizeTemperature(request.temperature, 0.2),
				maxOutputTokens: normalizeMaxOutputTokens(request.maxOutputTokens, 2048),
				responseMimeType: 'application/json',
				thinkingConfig: { thinkingBudget: 0 },
			},
		}),
	});

	if (!response.ok) {
		const raw = await safeReadText(response);
		throw new LlmProviderError({
			provider: 'gemini',
			statusCode: response.status,
			rawError: raw,
			message: `Gemini error (${response.status})`,
		});
	}

	const data = (await response.json()) as Record<string, unknown>;
	const candidates = data.candidates;
	if (!Array.isArray(candidates) || candidates.length === 0) {
		throw new LlmProviderError({
			provider: 'gemini',
			message: 'Gemini returned no candidates.',
			rawError: JSON.stringify(data),
		});
	}

	const first = candidates[0] as Record<string, unknown>;
	const finishReason = first.finishReason;
	if (finishReason === 'MAX_TOKENS') {
		throw new LlmProviderError({
			provider: 'gemini',
			message:
				'Gemini output was truncated at max tokens. Increase Max output tokens in provider settings.',
			rawError: JSON.stringify(data),
		});
	}

	const content = first.content as Record<string, unknown>;
	const parts = content?.parts;

	if (!Array.isArray(parts)) {
		throw new LlmProviderError({
			provider: 'gemini',
			message: 'Gemini response missing content parts.',
			rawError: JSON.stringify(data),
		});
	}

	const text = parts
		.map((part) => (isObjectWithKeys(part, ['text']) ? part.text : ''))
		.filter(isString)
		.join('')
		.trim();

	if (!text) {
		throw new LlmProviderError({
			provider: 'gemini',
			message: 'Gemini response text is empty.',
			rawError: JSON.stringify(data),
		});
	}

	return text;
}

async function callGrok(request: LlmRequest): Promise<string> {
	const endpoint = request.baseUrl?.trim() || 'https://api.x.ai/v1/chat/completions';

	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${request.apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: request.model,
			temperature: normalizeTemperature(request.temperature, 0.2),
			max_tokens: normalizeMaxOutputTokens(request.maxOutputTokens, 1400),
			messages: [
				{ role: 'system', content: request.instructions },
				{ role: 'user', content: request.input },
			],
		}),
	});

	if (!response.ok) {
		const raw = await safeReadText(response);
		throw new LlmProviderError({
			provider: 'grok',
			statusCode: response.status,
			rawError: raw,
			message: `Grok error (${response.status})`,
		});
	}

	const data = (await response.json()) as Record<string, unknown>;
	const choices = data.choices;
	if (!Array.isArray(choices) || choices.length === 0) {
		throw new LlmProviderError({
			provider: 'grok',
			message: 'Grok response missing choices.',
			rawError: JSON.stringify(data),
		});
	}

	const first = choices[0] as Record<string, unknown>;
	const message = first.message as Record<string, unknown>;
	const content = message?.content;

	if (!isString(content) || !content.trim()) {
		throw new LlmProviderError({
			provider: 'grok',
			message: 'Grok response content is empty.',
			rawError: JSON.stringify(data),
		});
	}

	return content;
}

function extractOpenAiText(value: unknown): string {
	if (!isObject(value)) {
		throw new Error('OpenAI response is invalid.');
	}

	const response = value;
	const direct = response.output_text;
	if (isString(direct) && direct.trim()) return direct;

	const output = response.output;
	if (!Array.isArray(output)) {
		throw new Error('OpenAI response missing output_text/output.');
	}

	const chunks: string[] = [];
	for (const item of output) {
		if (!isObject(item)) continue;
		const content = item.content;
		if (!Array.isArray(content)) continue;

		for (const part of content) {
			if (!isObject(part)) continue;
			const text = part.text;
			if (isString(text) && text.trim()) chunks.push(text);
		}
	}

	const merged = chunks.join('').trim();
	if (!merged) {
		throw new Error('Could not extract text from OpenAI response.');
	}

	return merged;
}

function normalizeTemperature(value: number | undefined, fallback: number): number {
	if (!isNumber(value)) return fallback;
	return clampNumber(value, 0, 2);
}

function normalizeMaxOutputTokens(value: number | undefined, fallback: number): number {
	if (!isPositiveInteger(value) || value! < 1) return fallback;

	return clampNumber(value, 1, 32000);
}

async function safeReadText(response: Response): Promise<string> {
	try {
		return await response.text();
	} catch {
		return 'Failed to read error body.';
	}
}
