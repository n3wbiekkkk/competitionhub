import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Trophy } from "lucide-react";
import {
  ShowcaseGallery,
  type ShowcaseCardItem,
} from "@/components/showcase/showcase-gallery";
import { withUserDb } from "@/lib/db/pool";
import {
  loadPublicShowcaseResults,
  showcaseCategoryLabel,
  type ShowcaseResultItem,
} from "@/lib/integrations/showcase";
import { logError } from "@/lib/utils/logger";
import {
  formatThaiDate,
  normalizeToIsoCeDate,
  parseIsoDateParts,
} from "@/lib/utils/thai-date";

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

function toShowcaseCardItem(result: ShowcaseResultItem): ShowcaseCardItem {
  const normalizedDate = normalizeToIsoCeDate(result.createdAt.slice(0, 10));
  const parts = normalizedDate ? parseIsoDateParts(normalizedDate) : null;

  return {
    id: result.id,
    competitionId: result.competitionId,
    competitionTitle: result.competitionTitle,
    categoryLabel: showcaseCategoryLabel(result.category),
    teamName: result.teamName,
    awardTitle: result.awardTitle,
    rankTier: result.rankTier,
    reflection: result.reflection,
    verifiedByName: result.verifiedByName,
    dateLabel: parts ? formatThaiDate(normalizedDate, "short") : "ไม่ระบุวันที่",
    yearValue: parts ? String(parts.year) : "",
  };
}

export default async function ShowcasePage() {
  let results: ShowcaseResultItem[] = [];
  try {
    results = await withUserDb(null, loadPublicShowcaseResults);
  } catch (error) {
    logError("[showcase] failed to load public results", error);
  }

  const items = results.map(toShowcaseCardItem);
  const teamCount = new Set(results.map((result) => result.teamId)).size;
  const competitionCount = new Set(
    results.map((result) => result.competitionId),
  ).size;
  const categoryCount = new Set(
    results.map((result) => showcaseCategoryLabel(result.category)),
  ).size;

  const impactStats = [
    { label: "ผลงานที่เผยแพร่", value: results.length },
    { label: "ทีมที่ได้รับรางวัล", value: teamCount },
    { label: "รายการแข่งขัน", value: competitionCount },
    { label: "สาขาที่ครอบคลุม", value: categoryCount },
  ];

  return (
    <main className="mx-auto w-full max-w-[1680px] space-y-10 px-4 py-10 sm:px-6 lg:px-8 xl:px-10">
      <header className="grid gap-8 border-b border-border pb-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            กลับหน้าแรก
          </Link>

          <div className="mt-8 flex items-center gap-2 text-primary">
            <Trophy className="h-4 w-4" />
            <span className="text-xs font-semibold tracking-[0.18em]">
              SHOWCASE · ผลงานที่ตรวจสอบแล้ว
            </span>
          </div>

          <h1 className="mt-4 text-4xl font-semibold leading-[1.35] tracking-tight text-foreground sm:text-5xl">
            ผลงานนักเรียน
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-[1.65] text-muted-foreground">
            เฉพาะผลการแข่งขันที่ทีมและอาจารย์ที่ปรึกษาอนุญาตให้เผยแพร่ และผ่านการตรวจสอบโดยอาจารย์แล้วเท่านั้น
          </p>
        </div>

        <div className="flex items-end lg:col-span-5 lg:pl-10">
          <div className="border-l-2 border-l-sage pl-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground">
              พื้นที่จัดแสดงผลงาน
            </p>
            <p className="mt-3 text-lg leading-[1.65] text-foreground/85">
              แรงบันดาลใจจากสิ่งที่นักเรียนลงมือทำจริง ทุกชิ้นงานผ่านการตรวจสอบก่อนเปิดเผยต่อสาธารณะ
            </p>
          </div>
        </div>
      </header>

      <section
        aria-label="ภาพรวมผลงานที่เผยแพร่"
        className="grid grid-cols-2 gap-px border-y border-border bg-border md:grid-cols-4"
      >
        {impactStats.map((stat) => (
          <div key={stat.label} className="bg-background px-5 py-6">
            <p className="font-mono text-3xl font-medium tabular-nums text-foreground">
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </section>

      {results.length === 0 ? (
        <div className="border border-dashed border-border px-6 py-16 text-center">
          <p className="text-sm font-medium leading-[1.35] text-foreground">
            ยังไม่มีผลงานที่เผยแพร่
          </p>
          <p className="mt-2 text-xs leading-[1.65] text-muted-foreground">
            ผลงานจะปรากฏที่นี่หลังอาจารย์ตรวจสอบและเจ้าของผลงานอนุญาตให้เปิดเผย
          </p>
        </div>
      ) : (
        <ShowcaseGallery items={items} />
      )}
    </main>
  );
}
