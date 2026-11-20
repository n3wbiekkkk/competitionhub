import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  LogIn,
  Users,
} from "lucide-react";
import { z } from "zod";
import { CompetitionActions } from "@/components/competitions/competition-actions";
import { InterestDrawer } from "@/components/competitions/interest-drawer";
import { TeacherQuickStatusButton } from "@/components/competitions/teacher-quick-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAuthenticatedProfile } from "@/lib/auth/cookies";
import {
  COMPETITION_STATUS_META,
  TECH_CATEGORY_META,
  TECH_ROLE_META,
  getCompetitionSourceLabel,
  isTechRole,
} from "@/lib/constants/tech-taxonomy";
import { withUserDb } from "@/lib/db/pool";
import {
  formatThaiDate,
  getDeadlineCountdown,
  getTodayIsoBangkok,
} from "@/lib/utils/thai-date";
import type { Competition, Interest } from "@/types/database";

const uuidSchema = z.string().uuid();

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return { title: "ไม่พบรายการแข่งขัน" };
  }

  try {
    const user = await getAuthenticatedProfile();
    const result = await withUserDb(user?.id ?? null, (client) =>
      client.query<Pick<Competition, "title" | "summary" | "category">>(
        `SELECT title, summary, category
         FROM public.competitions
         WHERE id = $1
         LIMIT 1`,
        [id],
      ),
    );
    const competition = result.rows[0];
    if (!competition) {
      return { title: "ไม่พบรายการแข่งขัน" };
    }
    const description =
      competition.summary?.replace(/\s+/g, " ").trim().slice(0, 160) ||
      `${TECH_CATEGORY_META[competition.category].labelTh} ในประเทศไทย`;
    return {
      title: competition.title,
      description,
      openGraph: {
        title: competition.title,
        description,
        type: "article",
      },
    };
  } catch {
    return { title: "รายละเอียดการแข่งขัน" };
  }
}

export default async function CompetitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    notFound();
  }

  const user = await getAuthenticatedProfile();
  const todayIso = getTodayIsoBangkok();

  let data: {
    competition: Competition;
    interestCount: number;
    myInterest: Interest | null;
    confirmedTeamName: string | null;
    relatedCompetitions: Pick<
      Competition,
      "id" | "title" | "category" | "deadline" | "min_size" | "max_size"
    >[];
  } | null;

  try {
    data = await withUserDb(user?.id ?? null, async (client) => {
    const compRes = await client.query<Competition>(
      `SELECT id, title, category, deadline::text, min_size, max_size,
              recommended_roles, tech_stack_hints, eligibility, summary,
              source_url, source_type, status, created_by,
              created_at::text, updated_at::text
       FROM public.competitions
       WHERE id = $1
       LIMIT 1`,
      [id],
    );
    const competition = compRes.rows[0];
    if (!competition) {
      return null;
    }

    const countRes = await client.query<{ interest_count: string }>(
      `SELECT interest_count::text
       FROM public.get_competition_interest_counts(ARRAY[$1::uuid])`,
      [id],
    );
    const interestCount = Number(countRes.rows[0]?.interest_count ?? 0);

    let myInterest: Interest | null = null;
    let confirmedTeamName: string | null = null;
    if (user) {
      const interestRes = await client.query<Interest>(
        `SELECT id, user_id, competition_id, preferred_role, note, created_at::text
         FROM public.interests
         WHERE user_id = $1 AND competition_id = $2
         LIMIT 1`,
        [user.id, id],
      );
      myInterest = interestRes.rows[0] ?? null;

      const teamRes = await client.query<{ name: string }>(
        `SELECT t.name
         FROM public.teams t
         JOIN public.team_members tm ON tm.team_id = t.id
         WHERE t.competition_id = $1
           AND t.status = 'confirmed'
           AND tm.user_id = $2
         LIMIT 1`,
        [id, user.id],
      );
      confirmedTeamName = teamRes.rows[0]?.name ?? null;
    }

    const relatedRes = await client.query<
      Pick<
        Competition,
        "id" | "title" | "category" | "deadline" | "min_size" | "max_size"
      >
    >(
      `SELECT id, title, category, deadline::text, min_size, max_size
       FROM public.competitions
       WHERE status = 'open'
         AND id <> $2
       ORDER BY (category = $1) DESC, deadline ASC NULLS LAST, created_at DESC
       LIMIT 3`,
      [competition.category, id],
    );

    return {
      competition,
      interestCount,
      myInterest,
      confirmedTeamName,
      relatedCompetitions: relatedRes.rows,
    };
    });
  } catch (error) {
    console.error("[competitions/[id]] load error", error);
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-xs font-medium text-muted-foreground">
          เชื่อมต่อฐานข้อมูลไม่สำเร็จชั่วคราว
        </p>
        <h1 className="mt-3 text-xl font-semibold tracking-tight">
          ยังโหลดรายละเอียดรายการแข่งขันไม่ได้
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          กรุณาลองรีเฟรชหน้านี้อีกครั้ง ข้อมูลการแข่งขันไม่ได้หายไป
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/">กลับหน้ารายการแข่งขัน</Link>
        </Button>
      </main>
    );
  }

  if (!data) {
    notFound();
  }

  const {
    competition,
    interestCount,
    myInterest,
    confirmedTeamName,
    relatedCompetitions,
  } = data;
  const catMeta = TECH_CATEGORY_META[competition.category];
  const statusMeta = COMPETITION_STATUS_META[competition.status];
  const countdown = getDeadlineCountdown(competition.deadline, todayIso);

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-2 gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            กลับไปหน้ารายการแข่งขัน
          </Link>
        </Button>

        {user?.role === "teacher" ? (
          <div className="flex flex-wrap items-center gap-2">
            <TeacherQuickStatusButton
              competitionId={competition.id}
              currentStatus={competition.status}
            />
            <Button
              asChild
              size="sm"
              variant="outline"
              className="gap-1.5 rounded-md"
            >
              <Link href={`/teacher/competitions/${competition.id}/teams`}>
                <Users className="h-4 w-4" />
                เปิดกระดานจัดทีม ({interestCount})
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-10 lg:grid-cols-12">
        {/* Left Main Content directly on canvas */}
        <article className="space-y-7 lg:col-span-8">
          <header className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">
                {catMeta.labelTh}
              </span>
              <span aria-hidden="true">·</span>
              <Badge
                variant="outline"
                className={`${statusMeta.badgeClassName} rounded-md px-2 py-0 text-[11px] font-medium`}
              >
                {statusMeta.labelTh}
              </Badge>
              <span aria-hidden="true">·</span>
              <span>{getCompetitionSourceLabel(competition.source_type)}</span>
            </div>

            <h1 className="text-2xl font-semibold leading-snug tracking-tight text-foreground sm:text-3xl">
              {competition.title}
            </h1>
          </header>

          {confirmedTeamName ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-primary bg-muted/40 px-4 py-3">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    คุณได้ทีมสำหรับการแข่งขันนี้แล้ว: {confirmedTeamName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ดูรายชื่อเพื่อนร่วมทีมและอาจารย์ที่ปรึกษาได้ในหน้าทีมของฉัน
                  </p>
                </div>
              </div>
              <Button asChild size="sm" variant="outline" className="rounded-md">
                <Link href="/my-teams">ดูทีมของฉัน</Link>
              </Button>
            </div>
          ) : null}

          <section className="space-y-2.5 border-t border-border pt-6">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground">
              รายละเอียดการแข่งขัน
            </h2>
            <p className="whitespace-pre-line text-sm leading-7 text-foreground/85 sm:text-[15px]">
              {competition.summary}
            </p>
          </section>

          {competition.eligibility ? (
            <section className="space-y-2 border-t border-border pt-6">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground">
                คุณสมบัติผู้สมัคร
              </h2>
              <p className="text-sm leading-relaxed text-foreground/85">
                {competition.eligibility}
              </p>
            </section>
          ) : null}

          <section className="space-y-3 border-t border-border pt-6">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground">
              บทบาทที่แนะนำในทีม
            </h2>
            <div className="grid gap-x-8 border-t border-border sm:grid-cols-2">
              {competition.recommended_roles.map((role) => (
                <div
                  key={role}
                  className="flex items-center justify-between gap-3 border-b border-border py-2.5"
                >
                  <span className="text-xs font-semibold text-foreground">
                    {role}
                  </span>
                  {isTechRole(role) ? (
                    <span className="text-xs text-muted-foreground">
                      {TECH_ROLE_META[role].labelTh}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          {competition.tech_stack_hints.length > 0 ? (
            <section className="space-y-3 border-t border-border pt-6">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground">
                เทคโนโลยีที่เกี่ยวข้อง
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {competition.tech_stack_hints.map((tech) => (
                  <span
                    key={tech}
                    className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-foreground/80"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </article>

        {/* Right Sticky Action Sidebar separated by hairline */}
        <aside className="lg:col-span-4 lg:border-l lg:border-border lg:pl-8">
          <div className="space-y-6 lg:sticky lg:top-20">
            <dl className="divide-y divide-border border-y border-border text-sm">
              <div className="flex items-start justify-between gap-4 py-3">
                <dt className="text-muted-foreground">ปิดรับสมัคร</dt>
                <dd className="text-right">
                  <span className="block font-medium tabular-nums text-foreground">
                    {formatThaiDate(competition.deadline, "long")}
                  </span>
                  {countdown.kind !== "none" ? (
                    <span
                      className={`mt-0.5 block font-mono text-xs tabular-nums ${
                        countdown.kind === "urgent" ||
                        countdown.kind === "today"
                          ? "font-medium text-primary"
                          : "text-muted-foreground"
                      }`}
                    >
                      {countdown.kind === "expired"
                        ? "ปิดรับแล้ว"
                        : countdown.label}
                    </span>
                  ) : null}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-muted-foreground">ขนาดทีม</dt>
                <dd className="font-medium tabular-nums text-foreground">
                  {competition.min_size === competition.max_size
                    ? `${competition.min_size} คน`
                    : `${competition.min_size}–${competition.max_size} คน`}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-muted-foreground">ผู้ลงชื่อสนใจ</dt>
                <dd className="font-medium tabular-nums text-foreground">
                  {interestCount} คน
                </dd>
              </div>
            </dl>

            <div className="space-y-2.5">
              <div className="[&>button]:w-full [&>button]:rounded-md">
                {user ? (
                  <InterestDrawer
                    competitionId={competition.id}
                    competitionTitle={competition.title}
                    recommendedRoles={competition.recommended_roles}
                    userSkills={user.skills}
                    existingInterest={myInterest}
                    isOpen={
                      competition.status === "open" && countdown.kind !== "expired"
                    }
                  />
                ) : (
                  <Button
                    asChild
                    size="lg"
                    className="w-full gap-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <Link href={`/login?next=/competitions/${competition.id}`}>
                      <LogIn className="h-4 w-4" />
                      เข้าสู่ระบบเพื่อลงชื่อสนใจแข่ง
                    </Link>
                  </Button>
                )}
              </div>

              {competition.source_url ? (
                <Button
                  asChild
                  variant="outline"
                  className="w-full gap-2 rounded-md"
                >
                  <a
                    href={competition.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" />
                    เปิดประกาศต้นทาง / ลิงก์สมัคร
                  </a>
                </Button>
              ) : null}

              <CompetitionActions
                competitionId={competition.id}
                title={competition.title}
                deadline={competition.deadline}
                summary={competition.summary}
                sourceUrl={competition.source_url}
                categoryLabel={catMeta.labelTh}
              />
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              ข้อมูลสกัดจากประกาศต้นทาง
              กรุณาตรวจสอบกำหนดการล่าสุดจากผู้จัดก่อนส่งผลงาน
            </p>
          </div>
        </aside>
      </div>

      {relatedCompetitions.length > 0 ? (
        <section className="space-y-3 border-t border-border pt-8">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground">
            รายการแข่งขันสาย Tech ในไทยที่เกี่ยวข้อง
          </h2>
          <div className="grid divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {relatedCompetitions.map((rel) => {
              const relCat = TECH_CATEGORY_META[rel.category];
              return (
                <Link
                  key={rel.id}
                  href={`/competitions/${rel.id}`}
                  className="group flex flex-col justify-between gap-3 py-4 transition-colors hover:bg-muted/30 sm:px-5 sm:first:pl-0 sm:last:pr-0"
                >
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">
                      {relCat.shortLabel}
                    </p>
                    <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
                      {rel.title}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      {formatThaiDate(rel.deadline, "short")}
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium text-foreground/80 transition-colors group-hover:text-primary">
                      รายละเอียด
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}
