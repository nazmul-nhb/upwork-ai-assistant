import {
	clampNumber,
	isNumber,
	isObject,
	isObjectWithKeys,
	isPositiveInteger,
	isString,
	isValidArray,
} from 'nhb-toolbox';
import type { LLMErrorParams, LLMProvider, LLMRequest } from './types';

export class LLMProviderError extends Error {
	provider: LLMProvider;
	statusCode?: number;
	rawError?: string;

	constructor(params: LLMErrorParams) {
		super(params.message);
		this.name = 'LLMProviderError';
		this.provider = params.provider;
		this.statusCode = params.statusCode;
		this.rawError = params.rawError;
	}
}

export async function callLlmJson(request: LLMRequest): Promise<string> {
	switch (request.provider) {
		case 'openai':
			return callOpenAI(request);
		case 'gemini':
			return callGemini(request);
		case 'grok':
			return callGrok(request);
		default:
			throw new Error(`Unsupported provider: ${request.provider satisfies never}`);
	}
}

async function callOpenAI(request: LLMRequest): Promise<string> {
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
		throw new LLMProviderError({
			provider: 'openai',
			statusCode: response.status,
			rawError: raw,
			message: `OpenAI error (${response.status})`,
		});
	}

	const data = (await response.json()) as unknown;
	return extractOpenAiText(data);
}

async function callGemini(request: LLMRequest): Promise<string> {
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
		throw new LLMProviderError({
			provider: 'gemini',
			statusCode: response.status,
			rawError: raw,
			message: `Gemini error (${response.status})`,
		});
	}

	const data = (await response.json()) as Record<string, unknown>;
	const candidates = data.candidates;
	if (!isValidArray<Record<string, unknown>>(candidates)) {
		throw new LLMProviderError({
			provider: 'gemini',
			message: 'Gemini returned no candidates.',
			rawError: JSON.stringify(data),
		});
	}

	const first = candidates[0];
	const finishReason = first.finishReason;
	if (finishReason === 'MAX_TOKENS') {
		throw new LLMProviderError({
			provider: 'gemini',
			message:
				'Gemini output was truncated at max tokens. Increase Max output tokens in provider settings.',
			rawError: JSON.stringify(data),
		});
	}

	const content = first.content as Record<string, unknown>;
	const parts = content?.parts;

	if (!Array.isArray(parts)) {
		throw new LLMProviderError({
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
		throw new LLMProviderError({
			provider: 'gemini',
			message: 'Gemini response text is empty.',
			rawError: JSON.stringify(data),
		});
	}

	return text;
}

async function callGrok(request: LLMRequest): Promise<string> {
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
		throw new LLMProviderError({
			provider: 'grok',
			statusCode: response.status,
			rawError: raw,
			message: `Grok error (${response.status})`,
		});
	}

	const data = (await response.json()) as Record<string, unknown>;
	const choices = data.choices;
	if (!isValidArray<Record<string, unknown>>(choices)) {
		throw new LLMProviderError({
			provider: 'grok',
			message: 'Grok response missing choices.',
			rawError: JSON.stringify(data),
		});
	}

	const message = choices[0].message as Record<string, unknown>;
	const content = message?.content;

	if (!isString(content) || !content.trim()) {
		throw new LLMProviderError({
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
