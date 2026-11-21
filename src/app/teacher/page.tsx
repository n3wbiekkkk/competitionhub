import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Users } from "lucide-react";
import { AccountPageHeader } from "@/components/account/account-page-header";
import { TECH_CATEGORY_META, isTechCategory } from "@/lib/constants/tech-taxonomy";
import { getAuthenticatedProfile } from "@/lib/auth/cookies";
import { withUserDb } from "@/lib/db/pool";
import { formatThaiDate } from "@/lib/utils/thai-date";

export const dynamic = "force-dynamic";

interface TeacherCompetitionRow {
  id: string;
  title: string;
  category: string;
  deadline: string | null;
  status: string;
}

export default async function TeacherStudioPage() {
  const user = await getAuthenticatedProfile();
  if (!user) redirect("/login?next=/teacher");
  if (user.role !== "teacher") redirect("/");

  let competitions: TeacherCompetitionRow[] = [];
  try {
    competitions = await withUserDb(user.id, async (client) => {
      const res = await client.query<TeacherCompetitionRow>(
        `select id, title, category, deadline::text, status
         from public.competitions
         where status in ('open', 'pending_review')
         order by case status when 'pending_review' then 0 else 1 end,
                  created_at desc
         limit 60`,
      );
      return res.rows;
    });
  } catch {
    competitions = [];
  }

  return (
    <main className="mx-auto w-full max-w-[1680px] space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 xl:px-10">
      <AccountPageHeader
        eyebrow="TechComp Studio"
        title="จัดทีมและดูแลทีม"
        description="เลือกการแข่งขันเพื่อเปิดบอร์ดจัดทีม ดูความพร้อมของทีม และประกาศผลการจัดทีม"
      />

      {competitions.length === 0 ? (
        <div className="surface-subtle rounded-2xl px-6 py-14 text-center">
          <p className="text-base font-semibold">ยังไม่มีรายการแข่งขันสำหรับจัดทีม</p>
          <p className="mt-1 text-sm text-muted-foreground">
            อนุมัติรายการแข่งขันในคิวตรวจก่อน จากนั้นกลับมาที่นี่เพื่อจัดทีม
          </p>
          <Link
            href="/teacher/review"
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            ไปที่คิวตรวจรายการ
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {competitions.map((competition) => {
            const meta = isTechCategory(competition.category)
              ? TECH_CATEGORY_META[competition.category]
              : null;
            return (
              <li key={competition.id}>
                <Link
                  href={`/teacher/competitions/${competition.id}/teams`}
                  className="surface-elevated flex h-full flex-col gap-4 rounded-2xl p-6 transition-colors hover:border-primary/30"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                      {meta?.shortLabel ?? competition.category}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {competition.deadline
                        ? formatThaiDate(competition.deadline, "short")
                        : "ไม่ระบุกำหนด"}
                    </span>
                  </div>
                  <h2 className="text-lg font-semibold leading-[1.35] text-foreground">
                    {competition.title}
                  </h2>
                  <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-4 text-sm font-medium text-primary">
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="h-4 w-4" />
                      เปิดบอร์ดจัดทีม
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
