# Upwork AI Assistant

![Upwork AI Assistant Icon](/public/icon.png)

A Chrome/Edge browser extension that analyzes Upwork job postings in real time and generates tailored proposals using AI. Navigate to any Upwork job details page, and the extension extracts comprehensive job data — budget, skills, client history, activity metrics — then feeds it to your chosen LLM provider to produce a fit score, risk assessment, targeted questions, and ready-to-submit proposals aligned with your professional profile.

## Features

- **Comprehensive job extraction** — Parses title, description, budget, experience level, skills, client activity (proposals, hires, interviewing), bid range, connects info, and full client profile (rating, reviews, location, spend history, hire rate, industry, and more).
- **Multi-provider AI analysis** — Supports OpenAI, Google Gemini, and Grok (xAI). Switch providers on the fly from the options page.
- **Personalized mindset profile** — Configure your name, role, core/secondary skills, no-go skills, proposal style rules, and red flags. The AI tailors every response to your unique profile.
- **Fit score and recommendations** — Receive a 0–100 fit score, key reasons to apply (or skip), identified risks, and a suggested bid amount.
- **Dual proposal generation** — Get both a short (1–2 sentence) and full-length proposal, ready to paste into Upwork.
- **Encrypted API key storage** — API keys are encrypted with a user-defined passphrase using custom HMAC-based encryption before being stored. Keys never leave your browser in plaintext.
- **Session passphrase memory** — Optionally remember your passphrase for the current browser session using `chrome.storage.session` (memory-only, never written to disk).
- **Side panel UI** — Full analysis workflow lives in the browser side panel — extract, review, analyze, and copy proposals without leaving the job page.
- **Popup quick-access** — Lightweight popup for status checks, opening the side panel, or jumping to settings.
- **Automated releases** — GitHub Actions workflow builds the extension and publishes versioned `.zip` releases automatically when the version in `package.json` is bumped.

## Supported URL Patterns

The extension activates on Upwork job detail pages:

- `https://www.upwork.com/jobs/*`
- `https://www.upwork.com/nx/find-work/details/*`
- `https://www.upwork.com/nx/find-work/best-matches/details/*`
- `https://www.upwork.com/nx/find-work/most-recent/details/*`
- `https://www.upwork.com/nx/find-work/*/details/*`

## Installation

### From GitHub Releases (recommended)

1. Go to the [Releases](https://github.com/nazmul-nhb/upwork-ai-assistant/releases) page.
2. Download the latest `upwork-ai-assistant-x.x.x.zip`.
3. Extract the zip to a folder.
4. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge).
5. Enable **Developer mode** (toggle in the top-right corner).
6. Click **Load unpacked** and select the extracted folder.

### From Source

```bash
# Clone the repository
git clone https://github.com/nazmul-nhb/upwork-ai-assistant.git
cd upwork-ai-assistant

# Install dependencies
pnpm install

# Build for production
pnpm build
```

The built extension will be in the `dist/` directory. Load it as an unpacked extension following steps 4–6 above.

## Configuration

### 1. Set Up an API Key

1. Click the extension icon → **Settings** (or right-click → Options).
2. Select your preferred LLM provider (OpenAI / Gemini / Grok).
3. Enter your API key and a passphrase to encrypt it.
4. Click **Save API Key**. The key is encrypted and stored locally.

### 2. Customize Your Mindset Profile

On the same Settings page, configure:

| Field                    | Description                                                 |
| ------------------------ | ----------------------------------------------------------- |
| **Profile Name**         | Your name as it appears in proposals                        |
| **Role Title**           | Your professional title                                     |
| **Core Skills**          | Primary skills (comma-separated)                            |
| **Secondary Skills**     | Additional skills you can leverage                          |
| **No-Go Skills**         | Skills you avoid — jobs heavily requiring these get flagged |
| **Proposal Style Rules** | Guidelines the AI follows when writing proposals            |
| **Red Flags**            | Warning signs the AI watches for in job postings            |

### 3. Provider Configuration

Each provider supports:

- **Model** — e.g., `gpt-5.2`, `gemini-2.5-flash`, `grok-3-latest`
- **Base URL** — API endpoint (pre-filled with defaults)
- **Temperature** — Controls response creativity (0.0–1.0)
- **Max Output Tokens** — Upper limit on response length

## Usage

1. Navigate to any Upwork job details page.
2. Click the extension icon → **Open Side Panel**.
3. The job data is automatically extracted and displayed as a preview.
4. Enter your passphrase (or enable "Remember passphrase for this session").
5. Click **Refresh Job** to re-extract if needed (e.g., after a page update or if the initial extraction failed).
6. Click **Analyze Job** — the AI processes the job against your profile.
7. Review the fit score, reasons, risks, questions, and proposals.
8. Click **Copy Short Proposal** or **Copy Full Proposal** to clipboard.
9. Click **Copy Prompt** to use tailored instructions for manual LLM queries.

## Architecture

```ini
src/
├── background/       # Service worker — message routing, LLM calls, extraction
├── content/          # Content script — DOM snapshot for fallback extraction
├── options/          # Settings page (API keys, provider config, mindset)
├── popup/            # Browser action popup (status, quick actions)
├── shared/           # Shared modules
│   ├── llm.ts        # LLM API client (OpenAI, Gemini, Grok)
│   ├── prompt.ts     # Prompt builder (mindset + job → instructions)
│   ├── storage.ts    # chrome.storage.local wrappers
│   ├── types.ts      # TypeScript type definitions
│   └── upwork.ts     # DOM extraction logic + preview formatter
└── sidepanel/        # Side panel UI (main analysis workflow)
```

### Key Design Decisions

- **`chrome.scripting.executeScript` for extraction** — The primary extraction path injects a self-contained function directly into the page, bypassing the CRXJS content script loader which can fail silently in production builds. This ensures reliable extraction without page refreshes.
- **Encrypted API keys** — Keys are encrypted (custom HMAC-based) with the user's passphrase before storage. The passphrase is never persisted to disk — only optionally held in `chrome.storage.session` (cleared when the browser closes).
- **Manifest V3** — Uses a service worker background script, side panel API, and declarative content scripts following the latest Chrome extension standards.

## Tech Stack

| Category         | Technology                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| **Framework**    | React 19 · TypeScript 5.9                                                                                  |
| **Build**        | Vite 7 · CRXJS Vite Plugin                                                                                 |
| **Extension**    | Manifest V3 · Chrome Side Panel API                                                                        |
| **AI Providers** | OpenAI · Google Gemini · Grok (xAI)                                                                        |
| **Encryption**   | Custom HMAC-based construction via [**Cipher**](https://toolbox.nazmul-nhb.dev/docs/utilities/hash/Cipher) |
| **Linting**      | ESLint 10 · Prettier                                                                                       |
| **CI/CD**        | GitHub Actions · Automated releases                                                                        |

## Scripts

| Command       | Description                         |
| ------------- | ----------------------------------- |
| `pnpm dev`    | Start Vite dev server with HMR      |
| `pnpm build`  | Type-check + production build + zip |
| `pnpm lint`   | Run ESLint across the codebase      |
| `pnpm format` | Format code with Prettier           |

## Privacy & Security

- **No telemetry.** The extension does not collect or transmit any analytics or usage data.
- **API calls stay between you and the provider.** Job data is sent only to the LLM provider you configure — nowhere else.
- **API keys are encrypted at rest** using custom HMAC-based encryption with your passphrase. The plaintext key exists only in memory during an active API call.
- **Session passphrase** uses `chrome.storage.session`, which is memory-only and automatically cleared when the browser session ends.
- **No external servers.** There is no backend — all logic runs locally in your browser.

## Contributing

Contributions are welcome. Please read the [Contributing Guide](CONTRIBUTING.md) before submitting a pull request.

## License

This project is private and not currently published under an open-source license. All rights reserved.

## Author

**Nazmul Hassan** — [GitHub](https://github.com/nazmul-nhb)
