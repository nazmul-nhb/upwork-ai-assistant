import type { ContentRequest, ContentResponse, ContentSnapshotMessage } from '@/shared/types';
import { extractUpworkJobFromDom } from '@/shared/upwork';

function sendSnapshot(): void {
	try {
		const job = extractUpworkJobFromDom(location.href);
		const message: ContentSnapshotMessage = { type: 'UPWORK_JOB_SNAPSHOT', job };
		void chrome.runtime.sendMessage(message);
	} catch {
		// Ignore extraction failures on intermediate render states.
	}
}

chrome.runtime.onMessage.addListener((message: ContentRequest, _sender, sendResponse) => {
	if (message.type !== 'REQUEST_JOB_SNAPSHOT') return false;

	try {
		const job = extractUpworkJobFromDom(location.href);
		sendResponse({ ok: true, job } satisfies ContentResponse);
	} catch (error) {
		const text = error instanceof Error ? error.message : 'Unable to extract job.';
		sendResponse({ ok: false, error: text } satisfies ContentResponse);
	}

	return false;
});

// Initial snapshot on page load
sendSnapshot();

// Watch for SPA navigation - lightweight event-based approach
let lastUrl = location.href;

// Listen to browser navigation events (back/forward buttons)
window.addEventListener('popstate', () => {
	if (location.href !== lastUrl) {
		lastUrl = location.href;
		sendSnapshot();
	}
});

// Listen to hash changes
window.addEventListener('hashchange', () => {
	if (location.href !== lastUrl) {
		lastUrl = location.href;
		sendSnapshot();
	}
});
