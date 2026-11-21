import { safeHttpUrl } from "./link-safety";
import { findMentionRanges } from "./mentions";
import type { MentionableMember } from "./types";

export type SafeSegment =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "mention"; text: string; userId: string };

interface Candidate {
  start: number;
  end: number;
  priority: number;
  segment: SafeSegment;
}

function overlaps(a: Candidate, b: Candidate): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Tokenizes chat text into React-renderable segments. Raw HTML is always text;
 * only validated http(s) links and roster-verified mentions become elements.
 */
export function parseSafeSegments(body: string, members: readonly MentionableMember[]): SafeSegment[] {
  const candidates: Candidate[] = [];

  const markdownLink = /\[([^\]\n]{1,200})\]\(([^)\n\s]{1,500})\)/g;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = markdownLink.exec(body)) !== null) {
    const href = safeHttpUrl(linkMatch[2]);
    if (!href) continue;
    candidates.push({
      start: linkMatch.index,
      end: linkMatch.index + linkMatch[0].length,
      priority: 0,
      segment: { kind: "link", text: linkMatch[1], href },
    });
  }

  for (const range of findMentionRanges(body, members)) {
    candidates.push({
      start: range.start,
      end: range.end,
      priority: 1,
      segment: { kind: "mention", text: body.slice(range.start, range.end), userId: range.userId },
    });
  }

  const bareUrl = /https?:\/\/[^\s<>()]+/g;
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = bareUrl.exec(body)) !== null) {
    const href = safeHttpUrl(urlMatch[0]);
    if (!href) continue;
    candidates.push({
      start: urlMatch.index,
      end: urlMatch.index + urlMatch[0].length,
      priority: 2,
      segment: { kind: "link", text: urlMatch[0], href },
    });
  }

  candidates.sort((a, b) => a.start - b.start || a.priority - b.priority);
  const accepted: Candidate[] = [];
  for (const candidate of candidates) {
    if (accepted.some((other) => overlaps(candidate, other))) continue;
    accepted.push(candidate);
  }

  const segments: SafeSegment[] = [];
  let cursor = 0;
  for (const candidate of accepted) {
    if (candidate.start > cursor) {
      segments.push({ kind: "text", text: body.slice(cursor, candidate.start) });
    }
    segments.push(candidate.segment);
    cursor = candidate.end;
  }
  if (cursor < body.length) {
    segments.push({ kind: "text", text: body.slice(cursor) });
  }
  return segments;
}
