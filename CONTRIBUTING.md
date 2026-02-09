# Contributing to Upwork AI Assistant

Thank you for your interest in contributing to Upwork AI Assistant. This guide covers the process for submitting bug reports, feature requests, and pull requests.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Submitting Changes](#submitting-changes)
- [Reporting Issues](#reporting-issues)

## Code of Conduct

Be respectful, constructive, and professional in all interactions. Harassment, discrimination, or disruptive behavior will not be tolerated.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v24 or later
- [pnpm](https://pnpm.io/) package manager
- Chrome or Edge browser (for testing the extension)
- A code editor (VS Code recommended)

### Development Setup

1. **Fork and clone the repository:**

   ```bash
   git clone https://github.com/<your-username>/upwork-ai-assistant.git
   cd upwork-ai-assistant
   ```

2. **Install dependencies:**

   ```bash
   pnpm install
   ```

3. **Start the development server:**

   ```bash
   pnpm dev
   ```

4. **Load the extension in Chrome/Edge:**

   - Open `chrome://extensions` or `edge://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked** → select the `dist` directory
   - The extension will hot-reload as you make changes

## Project Structure

```text
src/
├── background/       # Service worker (message handling, LLM calls, extraction)
├── content/          # Content script (DOM extraction fallback)
├── options/          # Options page (provider config, mindset profile)
├── popup/            # Browser action popup
├── shared/           # Shared utilities and types
│   ├── llm.ts        # LLM API client (OpenAI, Gemini, Grok)
│   ├── prompt.ts     # Prompt construction
│   ├── storage.ts    # chrome.storage.local wrapper
│   ├── types.ts      # TypeScript type definitions
│   └── upwork.ts     # DOM extraction + preview formatting
└── sidepanel/        # Side panel UI (primary analysis workflow)
```

### Key Files

| File                      | Purpose                                             |
| ------------------------- | --------------------------------------------------- |
| `manifest.config.ts`      | Chrome extension manifest (Manifest V3)             |
| `vite.config.ts`          | Vite build configuration with CRXJS and zip plugins |
| `eslint.config.mjs`       | ESLint configuration                                |
| `src/background/index.ts` | Service worker — all background logic lives here    |
| `src/shared/types.ts`     | All shared TypeScript types                         |

## Development Workflow

### Branching

1. Create a feature branch from `main`:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes in small, focused commits.

3. Push and open a pull request against `main`.

### Building

```bash
# Development (with HMR)
pnpm dev

# Production build (type-check → Vite build → zip)
pnpm build
```

### Linting and Formatting

```bash
# Lint
pnpm lint

# Format
pnpm format
```

Run both before submitting a PR. All code must pass linting without errors.

### Testing Changes

After making changes:

1. Run `pnpm build` to ensure the project compiles cleanly.
2. Load/reload the extension in `chrome://extensions`.
3. Test on a real Upwork job details page to verify extraction works.
4. Test the full workflow: extract → preview → analyze → copy proposal.

## Coding Standards

### TypeScript

- **Strict mode is enabled.** All code must be fully typed — avoid `any`.
- Use `type` over `interface` for consistency with the existing codebase.
- Prefer `satisfies` for type assertion on message payloads.
- Use `unknown` + type guards instead of `any` for deserialized data.

### React

- Functional components only.
- Hooks for all state management — no class components.
- Keep components small. Extract shared logic into the `shared/` directory.

### Chrome Extension Specifics

- The `extractJobFromPageDOM()` function in the background script **must remain self-contained**. It is serialized and injected via `chrome.scripting.executeScript`, so it cannot reference any imports, outer-scope variables, or closures.
- All message types are defined in `src/shared/types.ts` (`BgRequest`, `BgResponse`). Add new message types there.
- Use `chrome.storage.local` for persistent settings and `chrome.storage.session` for ephemeral data (e.g., session passphrase).

### Style

- Tabs for indentation (per project `.editorconfig` / Prettier config).
- Single quotes for strings.
- Trailing commas in multi-line structures.
- No unused imports or variables (enforced by ESLint + TypeScript).

## Submitting Changes

### Pull Request Guidelines

1. **One concern per PR.** Don't combine unrelated changes.
2. **Write a clear title and description.** Explain *what* changed and *why*.
3. **Ensure a clean build.** Run `pnpm build` — it must pass with zero errors.
4. **Lint your code.** Run `pnpm lint` before pushing.
5. **Test manually.** Verify the extension works end-to-end on a real Upwork page.
6. **Keep commits focused.** Squash fixup commits before requesting review.

### Commit Messages

Write clear, descriptive commit messages. Use the imperative mood:

- `Add session passphrase persistence`
- `Fix skills extraction selector for badge elements`
- `Update release workflow to attach zip asset`

Avoid vague messages like "fix stuff" or "update code".

## Reporting Issues

### Bug Reports

Include the following:

1. **Browser and version** (e.g., Chrome 132, Edge 131)
2. **Extension version** (from `chrome://extensions`)
3. **Steps to reproduce** — specific Upwork URLs help
4. **Expected vs. actual behavior**
5. **Console errors** — open DevTools on the extension's service worker (`chrome://extensions` → Inspect views: service worker) and include any error output

### Feature Requests

Open an issue with:

1. **Description** of the feature
2. **Use case** — why you need it
3. **Proposed implementation** (optional but appreciated)

---

Thank you for contributing!
