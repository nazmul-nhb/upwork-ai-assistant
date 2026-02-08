import type { UpworkJob } from "./types";

/**
 * Tries to extract job details from the current Upwork job page DOM.
 * Works best on /nx/find-work/details/*.
 * @param url Current page URL.
 */
export function extractUpworkJobFromDom(url: string): UpworkJob {
  const title =
    textFrom("h1") ||
    textFrom('[data-test="job-title"]') ||
    "Untitled job";

  // Description blocks vary; gather the biggest text region.
  const description =
    textFrom('[data-test="job-description-text"]') ||
    textFrom('[data-test="job-description"]') ||
    textFrom("section") ||
    document.body.innerText.slice(0, 20_000);

  const budgetText =
    findLabeledValue(["Budget", "Hourly Range", "Fixed-price"]) || undefined;

  const experienceLevel =
    findLabeledValue(["Experience level", "Experience Level"]) || undefined;

  const projectType =
    findLabeledValue(["Project type", "Project Type"]) || undefined;

  const skills = extractSkills();

  const clientLocation =
    findLabeledValue(["Location"]) || undefined;

  const clientHistorySummary =
    extractClientHistorySummary() || undefined;

  return {
    url,
    title,
    description,
    budgetText,
    experienceLevel,
    projectType,
    skills,
    clientLocation,
    clientHistorySummary
  };
}

/** @param selector CSS selector */
function textFrom(selector: string): string {
  const el = document.querySelector(selector);
  const t = el?.textContent?.trim() ?? "";
  return normalizeSpace(t);
}

/** @param s Input string */
function normalizeSpace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** @param labels Label candidates */
function findLabeledValue(labels: string[]): string {
  const text = document.body.innerText;
  for (const label of labels) {
    // best-effort: "Label\nValue" or "Label: Value"
    const rx = new RegExp(`${escapeRegExp(label)}\\s*[:\\n]\\s*([^\\n]+)`, "i");
    const m = text.match(rx);
    if (m?.[1]) return normalizeSpace(m[1]);
  }
  return "";
}

/** @param s string */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSkills(): string[] | undefined {
  const chips = Array.from(document.querySelectorAll('[data-test="skill"]'));
  const a = chips
    .map((x) => normalizeSpace(x.textContent ?? ""))
    .filter((x) => x.length > 0);

  if (a.length > 0) return uniq(a);

  // fallback: heuristics from page text
  const text = document.body.innerText;
  const m = text.match(/Skills\s*[:\n]\s*([^\n]+)/i);
  if (!m?.[1]) return undefined;

  const parts = m[1].split(",").map((p) => normalizeSpace(p)).filter(Boolean);
  return parts.length ? uniq(parts) : undefined;
}

/** @param arr string[] */
function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

function extractClientHistorySummary(): string {
  const text = document.body.innerText;

  // Keep this short - just a hint.
  const lines = text.split("\n").map((x) => normalizeSpace(x)).filter(Boolean);

  const idx = lines.findIndex((x) => /client|history|reviews|spent|hires/i.test(x));
  if (idx === -1) return "";

  return lines.slice(idx, idx + 6).join(" | ").slice(0, 400);
}
