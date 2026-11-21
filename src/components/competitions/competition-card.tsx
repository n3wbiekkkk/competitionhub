"use client";

import { createElement } from "react";
import Link from "next/link";
import { ArrowRight, Check, ExternalLink } from "lucide-react";
import { getCategoryIcon } from "@/components/competitions/category-icon";
import {
  TECH_CATEGORY_META,
  type TechCategory,
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

const CATEGORY_TINT: Record<TechCategory, string> = {
  "Programming / Competitive": "bg-sky/5",
  "AI & Data Science": "bg-lavender/5",
  "Web & Mobile Dev": "bg-sky/5",
  "Cybersecurity / CTF": "bg-peach/5",
  "Robotics & IoT": "bg-sage/5",
  "Game Dev": "bg-lavender/5",
  "Tech Hackathon & Innovation": "bg-sage/5",
  "UI/UX & Digital Design": "bg-peach/5",
};

function countdownClassName(kind: DeadlineCountdown["kind"]): string {
  switch (kind) {
    case "today":
    case "urgent":
      return "bg-peach/10 text-peach-foreground";
    case "expired":
      return "bg-muted text-muted-foreground";
    case "upcoming":
      return "bg-sage/10 text-sage-foreground";
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
  const countdownText =
    countdown.kind === "expired" ? "ปิดรับแล้ว" : countdown.label;
  const matchedCount = matchInfo?.matchedCount ?? 0;
  const visibleRoles = competition.recommended_roles.slice(0, 3);
  const extraRoleCount = competition.recommended_roles.length - visibleRoles.length;
  const visibleTech = competition.tech_stack_hints.slice(0, 4);
  const teamSize =
    competition.min_size === competition.max_size
      ? `${competition.min_size} คน`
      : `${competition.min_size}–${competition.max_size} คน`;

  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card p-6 shadow-xs">
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 h-24 ${CATEGORY_TINT[competition.category]}`}
      />

      <div className="relative flex flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${categoryMeta.badgeClassName}`}
          >
            {createElement(getCategoryIcon(competition.category), {
              className: "h-3.5 w-3.5",
            })}
            {categoryMeta.shortLabel}
          </span>
          {matchedCount > 0 ? (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 font-medium tabular-nums text-primary">
              ตรงทักษะ {matchedCount} รายการ
            </span>
          ) : null}
          {competition.my_preferred_role ? (
            <span className="inline-flex items-center gap-1 font-medium text-primary">
              <Check className="h-3.5 w-3.5" />
              ลงชื่อแล้ว ({competition.my_preferred_role})
            </span>
          ) : null}
          <span
            className={`ml-auto inline-flex items-center rounded-full px-2.5 py-1 font-mono text-xs tabular-nums ${countdownClassName(countdown.kind)}`}
          >
            {countdownText}
          </span>
        </div>

        <h3 className="mt-4 text-lg font-semibold leading-[1.35] tracking-tight text-foreground">
          <Link
            href={`/competitions/${competition.id}`}
            className="transition-colors hover:text-primary"
          >
            {competition.title}
          </Link>
        </h3>

        <p className="mt-2 font-mono text-xs tabular-nums text-muted-foreground">
          ปิดรับ {formatThaiDate(competition.deadline, "short")}
        </p>

        {competition.summary ? (
          <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {competition.summary}
          </p>
        ) : null}

        {visibleRoles.length > 0 || visibleTech.length > 0 ? (
          <div className="mt-4 space-y-2">
            {visibleRoles.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {visibleRoles.map((role) => (
                  <span
                    key={role}
                    className="rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground/80"
                  >
                    {role}
                  </span>
                ))}
                {extraRoleCount > 0 ? (
                  <span className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    +{extraRoleCount}
                  </span>
                ) : null}
              </div>
            ) : null}

            {visibleTech.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {visibleTech.map((tech) => {
                  const matched = matchInfo?.matchedHints.has(tech) ?? false;
                  return (
                    <button
                      key={tech}
                      type="button"
                      onClick={() => onTechChipClick(tech)}
                      title={`กรองรายการที่ใช้ ${tech}`}
                      className={`rounded px-1.5 py-0.5 font-mono text-[11px] transition-colors ${
                        matched
                          ? "border border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tech}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">ทีม {teamSize}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              สนใจ {competition.interest_count} คน
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {competition.source_url ? (
              <a
                href={competition.source_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`เปิดประกาศต้นทางของ ${competition.title}`}
                className="inline-flex items-center gap-1 px-1 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                ต้นทาง
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
            {userRole === "teacher" ? (
              <Link
                href={`/teacher/competitions/${competition.id}/teams`}
                className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                จัดทีม
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
      </div>
    </article>
  );
}
