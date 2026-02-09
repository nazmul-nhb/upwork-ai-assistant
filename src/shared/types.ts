export type LlmProvider = 'openai' | 'gemini' | 'grok';

export type UserMindset = {
	profileName: string;
	roleTitle: string;
	coreSkills: string[];
	secondarySkills: string[];
	noGoSkills: string[];
	proposalStyleRules: string[];
	redFlags: string[];
};

export type ProviderConfig = {
	model: string;
	apiKeyEncrypted?: string;
	baseUrl?: string;
	temperature?: number;
	maxOutputTokens?: number;
};

export type ProviderMap = {
	openai: ProviderConfig;
	gemini: ProviderConfig;
	grok: ProviderConfig;
};

export type ExtensionSettings = {
	activeProvider: LlmProvider;
	providers: ProviderMap;
	rememberPassphrase: boolean;
	mindset: UserMindset;
};

export type UpworkJob = {
	url: string;
	title: string;
	description: string;
	budgetText?: string;
	experienceLevel?: string;
	projectType?: string;
	skills?: string[];
	clientLocation?: string;
	clientHistorySummary?: string;
};

export type AnalysisResult = {
	shouldApply: boolean;
	fitScore: number;
	keyReasons: string[];
	risks: string[];
	questionsToAsk: string[];
	proposalShort: string;
	proposalFull: string;
	bidSuggestion?: string;
};

export type BgRequest =
	| { type: 'PING' }
	| { type: 'GET_SETTINGS' }
	| { type: 'SET_SETTINGS'; settings: ExtensionSettings }
	| { type: 'GET_ACTIVE_JOB' }
	| { type: 'EXTRACT_FROM_TAB' }
	| { type: 'TEST_PROVIDER_CONNECTION'; passphrase?: string }
	| { type: 'ANALYZE_JOB'; job: UpworkJob; passphrase?: string };

export type BgResponse =
	| { ok: true; type: 'PONG' }
	| { ok: true; type: 'SETTINGS'; settings: ExtensionSettings }
	| { ok: true; type: 'SAVED' }
	| { ok: true; type: 'ACTIVE_JOB'; job: UpworkJob | null }
	| { ok: true; type: 'CONNECTION_TEST'; message: string }
	| { ok: true; type: 'ANALYSIS'; result: AnalysisResult }
	| {
			ok: false;
			error: string;
			provider?: LlmProvider;
			statusCode?: number;
			rawError?: string;
	  };

export type ContentRequest = { type: 'REQUEST_JOB_SNAPSHOT' };
export type ContentResponse = { ok: true; job: UpworkJob } | { ok: false; error: string };
export type ContentSnapshotMessage = { type: 'UPWORK_JOB_SNAPSHOT'; job: UpworkJob };
