"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck } from "lucide-react";

export interface ShowcaseCardItem {
  id: string;
  competitionId: string;
  competitionTitle: string;
  categoryLabel: string;
  teamName: string;
  awardTitle: string;
  rankTier: string | null;
  reflection: string | null;
  verifiedByName: string;
  dateLabel: string;
  yearValue: string;
}

type AwardAccent = "sage" | "lavender" | "peach" | "sky";

const ACCENT_BORDER: Record<AwardAccent, string> = {
  sage: "border-l-sage",
  lavender: "border-l-lavender",
  peach: "border-l-peach",
  sky: "border-l-sky",
};

const ACCENT_RULE: Record<AwardAccent, string> = {
  sage: "bg-sage",
  lavender: "bg-lavender",
  peach: "bg-peach",
  sky: "bg-sky",
};

function accentFor(item: ShowcaseCardItem): AwardAccent {
  const label = `${item.rankTier ?? ""} ${item.awardTitle}`.toLowerCase();
  if (/ที่\s*1|รางวัลที่ 1|gold|ทองคำ/.test(label)) return "peach";
  if (/ที่\s*2|silver|เงิน/.test(label)) return "sky";
  if (/ที่\s*3|bronze|ทองแดง/.test(label)) return "sage";
  return "lavender";
}

export function ShowcaseGallery({ items }: { items: ShowcaseCardItem[] }) {
  const [year, setYear] = useState("all");
  const [category, setCategory] = useState("all");

  const years = useMemo(
    () =>
      [...new Set(items.map((item) => item.yearValue))]
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a)),
    [items],
  );
  const categories = useMemo(
    () =>
      [...new Set(items.map((item) => item.categoryLabel))].sort((a, b) =>
        a.localeCompare(b, "th"),
      ),
    [items],
  );

  const filtered = items.filter(
    (item) =>
      (year === "all" || item.yearValue === year) &&
      (category === "all" || item.categoryLabel === category),
  );

  return (
    <section aria-labelledby="showcase-gallery-heading" className="space-y-8">
      <div className="space-y-4 border-b border-border pb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2
            id="showcase-gallery-heading"
            className="text-lg font-semibold leading-[1.35] text-foreground"
          >
            คลังผลงานที่เผยแพร่
          </h2>
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            {filtered.length} / {items.length} ผลงาน
          </p>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="กรองตามปีการศึกษา">
          <button
            type="button"
            aria-pressed={year === "all"}
            onClick={() => setYear("all")}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground aria-pressed:border-primary aria-pressed:bg-muted aria-pressed:text-foreground"
          >
            ทุกปี
          </button>
          {years.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={year === value}
              onClick={() => setYear(value)}
              className="rounded-md border border-border px-3 py-1.5 font-mono text-xs tabular-nums text-muted-foreground transition-colors hover:text-foreground aria-pressed:border-primary aria-pressed:bg-muted aria-pressed:text-foreground"
            >
              พ.ศ. {value}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="กรองตามหมวดหมู่">
          <button
            type="button"
            aria-pressed={category === "all"}
            onClick={() => setCategory("all")}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground aria-pressed:border-primary aria-pressed:bg-muted aria-pressed:text-foreground"
          >
            ทุกหมวดหมู่
          </button>
          {categories.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground aria-pressed:border-primary aria-pressed:bg-muted aria-pressed:text-foreground"
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          ไม่มีผลงานที่ตรงกับตัวกรองที่เลือก
        </p>
      ) : (
        <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => {
            const accent = accentFor(item);
            return (
              <li key={item.id} className="h-full">
                <article
                  className={`flex h-full flex-col gap-4 border border-border border-l-2 bg-surface-elevated/50 px-5 py-5 ${ACCENT_BORDER[accent]}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                      {item.categoryLabel}
                    </span>
                    {item.rankTier ? (
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {item.rankTier}
                      </span>
                    ) : null}
                  </div>

                  <div className={`h-0.5 w-10 ${ACCENT_RULE[accent]}`} aria-hidden="true" />

                  <h3 className="text-lg font-semibold leading-[1.35] text-foreground">
                    {item.awardTitle}
                  </h3>

                  <p className="text-sm leading-[1.65] text-muted-foreground">
                    {item.teamName} ·{" "}
                    <Link
                      href={`/competitions/${item.competitionId}`}
                      className="text-foreground hover:underline"
                    >
                      {item.competitionTitle}
                    </Link>
                  </p>

                  {item.reflection ? (
                    <p className="whitespace-pre-line text-sm leading-[1.65] text-foreground/85">
                      {item.reflection}
                    </p>
                  ) : null}

                  <div className="mt-auto space-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
                    <p className="flex items-center gap-1.5">
                      <BadgeCheck className="h-3.5 w-3.5 text-primary" />
                      ตรวจสอบโดย {item.verifiedByName}
                    </p>
                    <p className="font-mono tabular-nums">{item.dateLabel}</p>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex justify-end">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground hover:text-primary"
        >
          ดูรายการแข่งขันที่ยังเปิดรับ
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
