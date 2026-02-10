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

// Watch for SPA-style navigation changes
let lastUrl = location.href;
const navigationObserver = new PerformanceObserver((list) => {
	for (const entry of list.getEntries()) {
		if (entry.entryType === 'navigation' || location.href !== lastUrl) {
			lastUrl = location.href;
			sendSnapshot();
			break;
		}
	}
});

// Use PerformanceObserver for modern browsers
try {
	navigationObserver.observe({ entryTypes: ['navigation'] });
} catch {
	// Fallback: listen to popstate and hashchange events
	window.addEventListener('popstate', () => {
		if (location.href !== lastUrl) {
			lastUrl = location.href;
			sendSnapshot();
		}
	});
}

// Fallback polling with much longer interval (only as last resort)
// and cleanup when page is hidden
let pollInterval: number | null = setInterval(() => {
	if (location.href !== lastUrl) {
		lastUrl = location.href;
		sendSnapshot();
	}
}, 5000); // Increased to 5 seconds

// Clean up resources when page is being unloaded or hidden
const cleanup = () => {
	if (pollInterval) {
		clearInterval(pollInterval);
		pollInterval = null;
	}
	try {
		navigationObserver.disconnect();
	} catch {
		// Ignore if not started
	}
};

window.addEventListener('beforeunload', cleanup);
document.addEventListener('visibilitychange', () => {
	if (document.hidden && pollInterval) {
		clearInterval(pollInterval);
		pollInterval = null;
	} else if (!document.hidden && pollInterval === null) {
		// Resume polling when page becomes visible again
		pollInterval = setInterval(() => {
			if (location.href !== lastUrl) {
				lastUrl = location.href;
				sendSnapshot();
			}
		}, 5000);
	}
});
