import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { withUserDb } from "@/lib/db/pool";
import {
  loadPublicShowcaseResults,
  showcaseCategoryLabel,
  type ShowcaseResultItem,
} from "@/lib/integrations/showcase";
import { logError } from "@/lib/utils/logger";
import { formatThaiDate } from "@/lib/utils/thai-date";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ผลงานนักเรียน",
  description:
    "ผลการแข่งขันด้านเทคโนโลยีของนักเรียนไทยที่ได้รับการตรวจสอบโดยอาจารย์และอนุญาตให้เผยแพร่สาธารณะ",
  openGraph: {
    title: "ผลงานนักเรียน · TechComp Hub",
    description: "ผลการแข่งขันเทคโนโลยีของนักเรียนไทยที่ได้รับการตรวจสอบ",
    images: ["/showcase/opengraph-image"],
  },
};

export default async function ShowcasePage() {
  let results: ShowcaseResultItem[] = [];
  try {
    results = await withUserDb(null, loadPublicShowcaseResults);
  } catch (error) {
    logError("[showcase] failed to load public results", error);
  }

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
      <header className="space-y-3 border-b border-border pb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          กลับหน้าแรก
        </Link>
        <div className="flex items-center gap-2 text-primary">
          <Trophy className="h-5 w-5" />
          <span className="text-xs font-semibold tracking-wide">SHOWCASE</span>
        </div>
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          ผลงานนักเรียน
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          เฉพาะผลการแข่งขันที่ทีมและอาจารย์ที่ปรึกษาอนุญาตให้เผยแพร่ และผ่านการตรวจสอบโดยอาจารย์แล้วเท่านั้น
        </p>
      </header>

      {results.length === 0 ? (
        <div className="border border-dashed border-border px-6 py-16 text-center">
          <p className="text-sm font-medium text-foreground">ยังไม่มีผลงานที่เผยแพร่</p>
          <p className="mt-2 text-xs text-muted-foreground">
            ผลงานจะปรากฏที่นี่หลังอาจารย์ตรวจสอบและเจ้าของผลงานอนุญาตให้เปิดเผย
          </p>
        </div>
      ) : (
        <ul className="space-y-6">
          {results.map((result) => (
            <li
              key={result.id}
              className="grid gap-3 border-b border-border pb-6 sm:grid-cols-12"
            >
              <div className="space-y-2 sm:col-span-8">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="rounded-md">
                    {showcaseCategoryLabel(result.category)}
                  </Badge>
                  {result.rankTier ? (
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {result.rankTier}
                    </span>
                  ) : null}
                </div>
                <h2 className="text-lg font-semibold text-foreground">
                  {result.awardTitle}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {result.teamName} ·{" "}
                  <Link
                    href={`/competitions/${result.competitionId}`}
                    className="text-foreground hover:underline"
                  >
                    {result.competitionTitle}
                  </Link>
                </p>
                {result.reflection ? (
                  <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                    {result.reflection}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1 text-xs text-muted-foreground sm:col-span-4 sm:text-right">
                <p className="flex items-center justify-end gap-1.5">
                  <BadgeCheck className="h-3.5 w-3.5 text-primary" />
                  ตรวจสอบโดย {result.verifiedByName}
                </p>
                <p className="font-mono tabular-nums">
                  {formatThaiDate(result.createdAt.slice(0, 10), "short")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
