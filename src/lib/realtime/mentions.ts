import type { MentionableMember } from "./types";

export interface MentionRange {
  start: number;
  end: number;
  userId: string;
  label: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasesFor(member: MentionableMember): string[] {
  const aliases = [member.nickname, member.fullName]
    .map((value) => value?.trim() ?? "")
    .filter((value) => value.length > 0);
  return [...new Set(aliases)].sort((a, b) => b.length - a.length);
}

/**
 * Finds @nickname / @full-name mentions against the confirmed roster.
 * Only roster names count, so arbitrary @text cannot fabricate a notification.
 */
export function findMentionRanges(body: string, members: readonly MentionableMember[]): MentionRange[] {
  const ranges: MentionRange[] = [];

  for (const member of members) {
    for (const alias of aliasesFor(member)) {
      const pattern = new RegExp(
        `(^|[\\s([{\u300C\uff08])(?:@|\uff20)${escapeRegExp(alias)}(?=$|[\\s.,!?;:)\\]}\u300D\uff09])`,
        "gu",
      );
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(body)) !== null) {
        const start = match.index + match[1].length;
        const end = start + 1 + alias.length;
        if (ranges.some((range) => start < range.end && end > range.start)) continue;
        ranges.push({ start, end, userId: member.id, label: alias });
      }
    }
  }

  return ranges.sort((a, b) => a.start - b.start);
}

export function extractMentionIds(body: string, members: readonly MentionableMember[]): string[] {
  const ids: string[] = [];
  for (const range of findMentionRanges(body, members)) {
    if (!ids.includes(range.userId)) ids.push(range.userId);
  }
  return ids;
}
