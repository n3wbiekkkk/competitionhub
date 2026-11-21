"use client";

import { createElement } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, Users } from "lucide-react";
import { getCategoryIcon } from "@/components/competitions/category-icon";
import {
  TECH_CATEGORY_META,
  type UserRole,
} from "@/lib/constants/tech-taxonomy";
import {
  formatThaiDate,
  getDeadlineCountdown,
  type DeadlineCountdown,
} from "@/lib/utils/thai-date";
import type { Competition } from "@/types/database";

export interface FeedCompetitionItem extends Competition {
  interest_count: number;
  my_preferred_role: string | null;
}

export interface CompetitionMatchInfo {
  matchedHints: Set<string>;
  matchedCount: number;
}

interface CompetitionCardProps {
  competition: FeedCompetitionItem;
  todayIso: string;
  userRole: UserRole | null;
  matchInfo?: CompetitionMatchInfo;
  onTechChipClick: (tech: string) => void;
}

type CardChip =
  | { kind: "role"; label: string }
  | { kind: "tech"; label: string; matched: boolean };

const MAX_CHIPS = 4;

function countdownClassName(kind: DeadlineCountdown["kind"]): string {
  switch (kind) {
    case "today":
    case "urgent":
      return "bg-peach/10 text-peach-foreground";
    case "expired":
    case "upcoming":
    case "none":
      return "bg-muted text-muted-foreground";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function CompetitionCard({
  competition,
  todayIso,
  userRole,
  matchInfo,
  onTechChipClick,
}: CompetitionCardProps) {
  const categoryMeta = TECH_CATEGORY_META[competition.category];
  const countdown = getDeadlineCountdown(competition.deadline, todayIso);
  const teamSize =
    competition.min_size === competition.max_size
      ? `${competition.min_size} คน`
      : `${competition.min_size}–${competition.max_size} คน`;

  const chips: CardChip[] = [
    ...competition.recommended_roles.map((role) => ({
      kind: "role" as const,
      label: role,
    })),
    ...competition.tech_stack_hints.map((tech) => ({
      kind: "tech" as const,
      label: tech,
      matched: matchInfo?.matchedHints.has(tech) ?? false,
    })),
  ];
  const visibleChips = chips.slice(0, MAX_CHIPS);
  const extraChipCount = chips.length - visibleChips.length;

  return (
    <article className="group relative flex h-full flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <div className="flex flex-col">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${categoryMeta.badgeClassName}`}
          >
            {createElement(getCategoryIcon(competition.category), {
              className: "h-3.5 w-3.5",
            })}
            {categoryMeta.shortLabel}
          </span>
          <span
            className={`ml-auto inline-flex items-center rounded-full px-2.5 py-1 font-mono text-xs tabular-nums ${countdownClassName(countdown.kind)}`}
          >
            {countdown.label}
          </span>
        </div>

        <h3 className="mt-4 line-clamp-2 text-[17px] font-semibold leading-[1.3] tracking-[-0.02em] text-foreground transition-colors group-hover:text-primary">
          <Link href={`/competitions/${competition.id}`}>
            {competition.title}
          </Link>
        </h3>

        <p className="mt-1.5 font-mono text-xs tabular-nums text-muted-foreground">
          ปิดรับ {formatThaiDate(competition.deadline, "short")}
        </p>

        {competition.summary ? (
          <p className="mt-3 line-clamp-2 text-[13.5px] leading-[1.65] text-muted-foreground">
            {competition.summary}
          </p>
        ) : null}

        {visibleChips.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            {visibleChips.map((chip) =>
              chip.kind === "tech" ? (
                <button
                  key={`tech-${chip.label}`}
                  type="button"
                  onClick={() => onTechChipClick(chip.label)}
                  title={`กรองรายการที่ใช้ ${chip.label}`}
                  className={`rounded px-1.5 py-0.5 font-mono text-[11px] transition-colors ${
                    chip.matched
                      ? "border border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {chip.label}
                </button>
              ) : (
                <span
                  key={`role-${chip.label}`}
                  className="rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground/80"
                >
                  {chip.label}
                </span>
              ),
            )}
            {extraChipCount > 0 ? (
              <span className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                +{extraChipCount}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs tabular-nums text-muted-foreground">
          <span>ทีม {teamSize}</span>
          <span aria-hidden="true">·</span>
          <span>สนใจ {competition.interest_count} คน</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {competition.source_url ? (
            <a
              href={competition.source_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`เปิดประกาศต้นทางของ ${competition.title}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
          {userRole === "teacher" ? (
            <Link
              href={`/teacher/competitions/${competition.id}/teams`}
              aria-label="จัดทีม"
              title="จัดทีม"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-primary"
            >
              <Users className="h-4 w-4" />
            </Link>
          ) : null}
          <Link
            href={`/competitions/${competition.id}`}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            ดูรายละเอียด
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}
