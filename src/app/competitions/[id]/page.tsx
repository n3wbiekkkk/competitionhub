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
import { CompetitionBookmarkButton } from "@/components/competitions/competition-bookmark-button";
import { CompetitionCommunity } from "@/components/competitions/competition-community";
import { CompetitionDetailTabs } from "@/components/competitions/competition-detail-tabs";
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
import { explainSkillMatch } from "@/lib/utils/skill-match";
import {
  formatThaiDate,
  getDeadlineCountdown,
  getTodayIsoBangkok,
  normalizeToIsoCeDate,
} from "@/lib/utils/thai-date";
import type { Competition, Interest } from "@/types/database";

const uuidSchema = z.string().uuid();

function formatDateOrFallback(value: string | null, fallback: string): string {
  const normalized = normalizeToIsoCeDate(value);
  return normalized ? formatThaiDate(normalized, "long") : fallback;
}

function getSourceHost(sourceUrl: string | null): string | null {
  if (!sourceUrl) return null;
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

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
      <main className="mx-auto w-full max-w-[1680px] px-4 py-16 text-center sm:px-6 lg:px-8 xl:px-10">
        <p className="text-xs font-medium text-muted-foreground">
          เชื่อมต่อฐานข้อมูลไม่สำเร็จชั่วคราว
        </p>
        <h1 className="mt-3 text-xl font-semibold leading-[1.35] tracking-tight">
          ยังโหลดรายละเอียดรายการแข่งขันไม่ได้
        </h1>
        <p className="mt-2 text-sm leading-[1.65] text-muted-foreground">
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
  const sourceHost = getSourceHost(competition.source_url);
  const skillMatch = explainSkillMatch({
    userSkills: user?.skills ?? [],
    competition: {
      title: competition.title,
      summary: competition.summary,
      recommended_roles: competition.recommended_roles,
      tech_stack_hints: competition.tech_stack_hints,
    },
  });

  const timeline = [
    {
      label: "เปิดรับ",
      value: formatDateOrFallback(
        competition.created_at.slice(0, 10),
        "เริ่มติดตามข้อมูล",
      ),
      note: "เริ่มบันทึกข้อมูลในระบบ",
    },
    {
      label: "ปิดรับ",
      value: formatDateOrFallback(competition.deadline, "ยังไม่ระบุ"),
      note: countdown.kind === "none" ? "รอประกาศจากผู้จัด" : countdown.label,
    },
    {
      label: "วันแข่งขัน",
      value: "ตามประกาศต้นทาง",
      note: "ตรวจกำหนดการล่าสุดก่อนส่งผลงาน",
    },
  ];

  const detailsPanel = (
    <div className="space-y-8">
      <section className="space-y-2.5">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground">
          ภาพรวมของรายการ
        </h2>
        <p className="whitespace-pre-line text-sm leading-[1.65] text-foreground/85 sm:text-[15px]">
          {competition.summary}
        </p>
      </section>

      {competition.eligibility ? (
        <section className="space-y-2 border-t border-border pt-6">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground">
            คุณสมบัติผู้สมัคร
          </h2>
          <p className="text-sm leading-[1.65] text-foreground/85">
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
    </div>
  );

  const teamPanel = (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-l-2 border-primary bg-muted/30 px-5 py-4">
        <div>
          <p className="font-mono text-2xl font-medium tabular-nums text-foreground">
            {interestCount}
          </p>
          <p className="text-xs text-muted-foreground">คนลงชื่อสนใจรายการนี้</p>
        </div>
        <p className="max-w-sm text-xs leading-[1.65] text-muted-foreground">
          ครูที่ปรึกษาใช้ข้อมูลนี้ร่วมกับบทบาทที่เลือกเพื่อจัดทีมให้เหมาะสมกับรายการ
        </p>
      </div>

      {myInterest ? (
        <p className="text-sm leading-[1.65] text-foreground/85">
          คุณลงชื่อสนใจแล้วในบทบาท{" "}
          <span className="font-medium">{myInterest.preferred_role}</span>{" "}
          สามารถแก้ไขได้จากปุ่มด้านขวาของหน้านี้
        </p>
      ) : (
        <p className="text-sm leading-[1.65] text-muted-foreground">
          ยังไม่ได้ลงชื่อสนใจรายการนี้ กดปุ่มด้านขวาเพื่อเลือกบทบาทที่คุณอยากทำในทีม
        </p>
      )}

      <Button asChild variant="outline" className="gap-1.5 rounded-md">
        <Link href="/my-teams">
          ดูรายการที่ลงชื่อและทีมของฉัน
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-[1680px] space-y-10 px-4 py-8 sm:px-6 lg:px-8 xl:px-10">
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
        <article className="min-w-0 space-y-8 lg:col-span-8">
          <header className="rounded-xl border border-border bg-surface-elevated p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={`${catMeta.badgeClassName} rounded-md px-2 py-0.5 text-[11px] font-medium`}
              >
                {catMeta.labelTh}
              </Badge>
              <Badge
                variant="outline"
                className={`${statusMeta.badgeClassName} rounded-md px-2 py-0.5 text-[11px] font-medium`}
              >
                {statusMeta.labelTh}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {getCompetitionSourceLabel(competition.source_type)}
              </span>
            </div>

            <h1 className="mt-5 max-w-4xl text-3xl font-semibold leading-[1.35] tracking-tight text-foreground sm:text-4xl">
              {competition.title}
            </h1>

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span>
                ผู้จัด / แหล่งข้อมูล:{" "}
                <span className="font-medium text-foreground/80">
                  {sourceHost ?? getCompetitionSourceLabel(competition.source_type)}
                </span>
              </span>
              {competition.source_url ? (
                <a
                  href={competition.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-primary hover:underline"
                >
                  เปิดประกาศต้นทาง
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>

            <ol className="mt-8 flex items-start border-t border-border pt-6">
              {timeline.map((step, index) => (
                <li key={step.label} className="flex min-w-0 flex-1 items-start">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium tracking-wide text-muted-foreground">
                      {step.label}
                    </p>
                    <p className="mt-1 text-sm font-medium tabular-nums text-foreground">
                      {step.value}
                    </p>
                    <p className="mt-1 text-[11px] leading-[1.65] text-muted-foreground">
                      {step.note}
                    </p>
                  </div>
                  {index < timeline.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className="px-2 pt-4 font-mono text-muted-foreground"
                    >
                      →
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </header>

          {confirmedTeamName ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-primary bg-muted/40 px-4 py-3">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium leading-[1.35] text-foreground">
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

          <CompetitionDetailTabs
            details={detailsPanel}
            team={teamPanel}
            community={<CompetitionCommunity competitionId={competition.id} />}
          />
        </article>

        <aside className="min-w-0 lg:col-span-4">
          <div className="space-y-5 lg:sticky lg:top-24">
            <section className="border-y border-border py-5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground">
                ระยะเวลาลงชื่อสนใจ
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-4xl font-medium tabular-nums text-foreground">
                  {countdown.daysRemaining === null
                    ? "—"
                    : Math.abs(countdown.daysRemaining)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {countdown.kind === "none"
                    ? "ไม่ระบุกำหนด"
                    : countdown.kind === "expired"
                      ? "วันที่ปิดรับแล้ว"
                      : "วันเหลืออยู่"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDateOrFallback(
                  competition.deadline,
                  "ยังไม่ระบุวันปิดรับสมัคร",
                )}
              </p>
            </section>

            <dl className="divide-y divide-border border-y border-border text-sm">
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
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-muted-foreground">หมวดหมู่</dt>
                <dd className="text-right font-medium text-foreground">
                  {catMeta.shortLabel}
                </dd>
              </div>
            </dl>

            {competition.eligibility ? (
              <section className="border-y border-border py-4">
                <h2 className="text-xs font-medium tracking-wide text-muted-foreground">
                  คุณสมบัติผู้สมัคร
                </h2>
                <p className="mt-2 line-clamp-3 text-xs leading-[1.65] text-foreground/85">
                  {competition.eligibility}
                </p>
              </section>
            ) : null}

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

              <CompetitionBookmarkButton competitionId={competition.id} />

              <CompetitionActions
                competitionId={competition.id}
                title={competition.title}
                deadline={competition.deadline}
                summary={competition.summary}
                sourceUrl={competition.source_url}
                categoryLabel={catMeta.labelTh}
              />
            </div>

            <section className="border-t border-border pt-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-xs font-medium tracking-wide text-muted-foreground">
                  ความตรงกับทักษะของคุณ
                </h2>
                {user ? (
                  <span className="font-mono text-xl font-medium tabular-nums text-foreground">
                    {skillMatch.score}%
                  </span>
                ) : null}
              </div>
              {user ? (
                <div className="mt-3 space-y-3">
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${skillMatch.score}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ทักษะของคุณตรงกับรายการนี้ {skillMatch.matchedSkills.length} รายการ
                  </p>
                  {skillMatch.matchedSkills.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {skillMatch.matchedSkills.slice(0, 4).map((match) => (
                        <span
                          key={match.skill}
                          className="rounded bg-sage px-2 py-0.5 font-mono text-[11px] text-sage-foreground"
                        >
                          {match.skill}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      ยังไม่พบทักษะที่ตรงกับข้อมูลในประกาศ
                    </p>
                  )}
                  {skillMatch.missingSkills.length > 0 ? (
                    <p className="text-xs leading-[1.65] text-muted-foreground">
                      ทักษะที่ยังไม่ตรง: {skillMatch.missingSkills.slice(0, 3).join(", ")}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-xs leading-[1.65] text-muted-foreground">
                  เข้าสู่ระบบเพื่อดูว่าทักษะของคุณตรงกับรายการนี้มากน้อยเพียงใด
                </p>
              )}
            </section>

            <p className="text-xs leading-[1.65] text-muted-foreground">
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
                    <p className="line-clamp-2 text-sm font-medium leading-[1.35] text-foreground transition-colors group-hover:text-primary">
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
