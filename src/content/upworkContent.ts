import { extractUpworkJobFromDom } from "../shared/upworkExtract";
import type { UpworkJob } from "../shared/types";

type ContentMsg = { type: "UPWORK_JOB_SNAPSHOT"; job: UpworkJob };

function sendSnapshot(): void {
  try {
    const job = extractUpworkJobFromDom(location.href);
    const msg: ContentMsg = { type: "UPWORK_JOB_SNAPSHOT", job };
    void chrome.runtime.sendMessage(msg);
  } catch {
    // ignore
  }
}

sendSnapshot();

// Re-send when URL changes (SPA)
let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    sendSnapshot();
  }
}, 1200);
