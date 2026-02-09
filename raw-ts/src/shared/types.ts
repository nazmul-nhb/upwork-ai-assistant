export type LlmProvider = 'openai';

export type UserMindset = {
	profileName: string;
	roleTitle: string;
	coreSkills: string[];
	secondarySkills: string[];
	noGoSkills: string[];
	proposalStyleRules: string[];
	redFlags: string[];
	defaultModel: string;
};

export type EncryptedSecret = {
	/** Base64 payload produced by crypto.ts */
	payloadB64: string;
	/** Base64 iv */
	ivB64: string;
	/** Base64 salt for key derivation */
	saltB64: string;
	/** Metadata */
	alg: 'PBKDF2-SHA256/AES-GCM';
};

export type ExtensionSettings = {
	provider: LlmProvider;
	/** Encrypted OpenAI API key */
	openaiApiKey?: string;
	/** User-entered passphrase to unlock the encrypted key (not stored by default) */
	rememberPassphrase: boolean;
	/** Optional: store an encrypted passphrase blob (still decryptable by extension) */
	encryptedPassphrase?: string;
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
	fitScore: number; // 0-100
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
	| { type: 'ANALYZE_JOB'; job: UpworkJob; passphrase?: string };

export type BgResponse =
	| { ok: true; type: 'PONG' }
	| { ok: true; type: 'SETTINGS'; settings: ExtensionSettings }
	| { ok: true; type: 'SAVED' }
	| { ok: true; type: 'ANALYSIS'; result: AnalysisResult }
	| { ok: false; error: string };
