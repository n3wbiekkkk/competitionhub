import {
  normalizeToIsoCeDate,
  parseIsoDateParts,
} from "@/lib/utils/thai-date";

export const DEDUP_REVIEW_THRESHOLD = 0.72;
export const DEDUP_DUPLICATE_THRESHOLD = 0.85;
export const DEDUP_DEADLINE_WINDOW_DAYS = 7;

const MS_PER_DAY = 86_400_000;
const NEAR_DEADLINE_BONUS = 0.05;
const FAR_DEADLINE_CAP = DEDUP_REVIEW_THRESHOLD;
const TRACKING_PARAM_PATTERN =
  /^utm_|^(?:fbclid|gclid|ref|source|mc_cid|mc_eid)$/i;

export interface DedupeCandidate {
  title: string;
  sourceUrl?: string | null;
  deadline?: string | null;
}

export interface DedupeExisting extends DedupeCandidate {
  id: string;
}

export type DedupeAction = "insert" | "needs_review" | "skip";

export type DedupeReason =
  | "unique"
  | "exact_url"
  | "near_duplicate"
  | "possible_duplicate";

export interface DedupeDecision {
  action: DedupeAction;
  reason: DedupeReason;
  score: number;
  matchId: string | null;
}

export function normalizeCompetitionTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCompetitionSourceUrl(
  value: string | null | undefined,
): string | null {
  if (!value || !value.trim()) {
    return null;
  }

  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    parsed.pathname =
      parsed.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAM_PATTERN.test(key)) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.searchParams.sort();

    if (
      (parsed.protocol === "http:" && parsed.port === "80") ||
      (parsed.protocol === "https:" && parsed.port === "443")
    ) {
      parsed.port = "";
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export function compareCompetitionTitles(
  left: string,
  right: string,
): number {
  const leftGrams = titleTrigrams(left);
  const rightGrams = titleTrigrams(right);
  if (leftGrams.size === 0 || rightGrams.size === 0) {
    return 0;
  }

  let shared = 0;
  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) {
      shared += 1;
    }
  }

  return shared / (leftGrams.size + rightGrams.size - shared);
}

export function dedupeCompetition(
  candidate: DedupeCandidate,
  existing: readonly DedupeExisting[],
): DedupeDecision {
  const candidateUrl = normalizeCompetitionSourceUrl(candidate.sourceUrl);
  if (candidateUrl) {
    const urlMatch = existing.find(
      (item) => normalizeCompetitionSourceUrl(item.sourceUrl) === candidateUrl,
    );
    if (urlMatch) {
      return {
        action: "skip",
        reason: "exact_url",
        score: 1,
        matchId: urlMatch.id,
      };
    }
  }

  let best: { id: string; score: number } | null = null;
  for (const item of existing) {
    const titleScore = compareCompetitionTitles(candidate.title, item.title);
    if (titleScore === 0) {
      continue;
    }

    const score = scoreWithDeadline(
      titleScore,
      candidate.deadline,
      item.deadline,
    );
    if (
      !best ||
      score > best.score ||
      (score === best.score && item.id < best.id)
    ) {
      best = { id: item.id, score };
    }
  }

  if (!best || best.score < DEDUP_REVIEW_THRESHOLD) {
    return {
      action: "insert",
      reason: "unique",
      score: best?.score ?? 0,
      matchId: null,
    };
  }

  if (best.score >= DEDUP_DUPLICATE_THRESHOLD) {
    return {
      action: "skip",
      reason: "near_duplicate",
      score: best.score,
      matchId: best.id,
    };
  }

  return {
    action: "needs_review",
    reason: "possible_duplicate",
    score: best.score,
    matchId: best.id,
  };
}

function titleTrigrams(title: string): Set<string> {
  const normalized = normalizeCompetitionTitle(title);
  if (normalized.length === 0) {
    return new Set<string>();
  }
  if (normalized.length < 3) {
    return new Set<string>([normalized]);
  }

  const grams = new Set<string>();
  for (let index = 0; index <= normalized.length - 3; index += 1) {
    grams.add(normalized.slice(index, index + 3));
  }
  return grams;
}

function deadlineDay(value: string | null | undefined): number | null {
  const normalized = normalizeToIsoCeDate(value);
  if (!normalized) {
    return null;
  }

  const parts = parseIsoDateParts(normalized);
  if (!parts) {
    return null;
  }

  return Math.trunc(
    Date.UTC(parts.year, parts.month - 1, parts.day) / MS_PER_DAY,
  );
}

function scoreWithDeadline(
  titleScore: number,
  candidateDeadline: string | null | undefined,
  existingDeadline: string | null | undefined,
): number {
  const candidateDay = deadlineDay(candidateDeadline);
  const existingDay = deadlineDay(existingDeadline);
  if (candidateDay === null || existingDay === null) {
    return titleScore;
  }

  const daysApart = Math.abs(candidateDay - existingDay);
  if (daysApart > DEDUP_DEADLINE_WINDOW_DAYS) {
    return Math.min(titleScore, FAR_DEADLINE_CAP);
  }

  return Math.min(1, titleScore + NEAR_DEADLINE_BONUS);
}
