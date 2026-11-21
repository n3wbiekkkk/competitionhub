import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, GitBranch, Mail, MessageSquare } from "lucide-react";
import { MyTeamCard } from "@/components/account/my-team-card";
import type {
  ConfirmedMemberRow,
  ConfirmedTeamRow,
  MyInterestRow,
} from "@/components/account/my-team-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAuthenticatedProfile } from "@/lib/auth/cookies";
import { COMPETITION_STATUS_META } from "@/lib/constants/tech-taxonomy";
import { withUserDb } from "@/lib/db/pool";
import { formatThaiDate } from "@/lib/utils/thai-date";
import type { Competition } from "@/types/database";

function TeamMembers({
  team,
  members,
  viewerId,
}: {
  team: ConfirmedTeamRow;
  members: ConfirmedMemberRow[];
  viewerId: string;
}) {
  return (
    <div className="space-y-4 border-l-2 border-primary bg-muted/30 px-4 py-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">ทีม: {team.team_name}</p>
          <p className="text-xs text-muted-foreground">
            อาจารย์ที่ปรึกษา: {team.advisor_name ?? "ยังไม่ระบุ"}
            {team.advisor_contact
              ? ` (${team.advisor_contact})`
              : team.advisor_email
                ? ` (${team.advisor_email})`
                : ""}
          </p>
        </div>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          สมาชิก {members.length} คน
        </span>
      </div>
      <div className="grid gap-x-6 border-t border-border sm:grid-cols-2">
        {members.map((member) => (
          <div key={member.user_id} className="space-y-1.5 border-b border-border py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {member.user_id === viewerId ? (
                    member.full_name
                  ) : (
                    <Link
                      href={`/people/${member.user_id}`}
                      className="hover:text-primary hover:underline underline-offset-4"
                    >
                      {member.full_name}
                    </Link>
                  )}
                  {member.nickname ? ` (${member.nickname})` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {member.grade ? `${member.grade} · ` : ""}{member.assigned_role}
                </p>
              </div>
              <Badge variant="outline" className="shrink-0 text-[10px]">สมาชิกทีม</Badge>
            </div>
            {member.skills.length > 0 ? (
              <p className="text-xs text-muted-foreground">ทักษะ: {member.skills.join(", ")}</p>
            ) : null}
            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5 text-xs text-muted-foreground">
              {member.contact ? (
                <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{member.contact}</span>
              ) : null}
              <span className="inline-flex items-center gap-1 break-all"><Mail className="h-3 w-3 shrink-0" />{member.email}</span>
              {member.github_url ? (
                <a href={member.github_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><GitBranch className="h-3 w-3" />GitHub<ExternalLink className="h-2.5 w-2.5" /></a>
              ) : null}
              {member.portfolio_url ? (
                <a href={member.portfolio_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">ผลงาน<ExternalLink className="h-2.5 w-2.5" /></a>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function MyTeamsPage() {
  const user = await getAuthenticatedProfile();
  if (!user) {
    redirect("/login?next=/my-teams");
  }

  const { interests, teamByCompetition, membersByTeam, mySubmissions } =
    await withUserDb(user.id, async (client) => {
      const interestRes = await client.query<MyInterestRow>(
        `SELECT i.competition_id, i.preferred_role, i.note,
                c.title, c.category, c.deadline::text, c.status AS comp_status
         FROM public.interests i
         JOIN public.competitions c ON c.id = i.competition_id
         WHERE i.user_id = $1
         ORDER BY c.deadline ASC NULLS LAST, i.created_at DESC`,
        [user.id],
      );

      // RLS automatically restricts teams/team_members to confirmed teams where user is a member
      const teamRes = await client.query<ConfirmedTeamRow>(
        `SELECT t.id AS team_id,
                t.name AS team_name,
                t.competition_id,
                adv.full_name AS advisor_name,
                adv.email AS advisor_email,
                adv.contact AS advisor_contact
         FROM public.teams t
         JOIN public.team_members my_tm
           ON my_tm.team_id = t.id
          AND my_tm.user_id = $1
         LEFT JOIN public.profiles adv ON adv.id = t.advisor_id
         WHERE t.status = 'confirmed'`,
        [user.id],
      );

      const teamIds = teamRes.rows.map((t) => t.team_id);
      const membersMap = new Map<string, ConfirmedMemberRow[]>();

      if (teamIds.length > 0) {
        const memRes = await client.query<ConfirmedMemberRow>(
          `SELECT tm.team_id, tm.user_id, tm.assigned_role,
                  p.full_name, p.nickname, p.grade, p.skills, p.contact,
                  p.github_url, p.portfolio_url, p.email
           FROM public.team_members tm
           JOIN public.profiles p ON p.id = tm.user_id
           WHERE tm.team_id = ANY($1::uuid[])
           ORDER BY p.full_name ASC`,
          [teamIds],
        );
        for (const row of memRes.rows) {
          const existing = membersMap.get(row.team_id) ?? [];
          existing.push(row);
          membersMap.set(row.team_id, existing);
        }
      }

      const subRes = await client.query<Competition>(
        `SELECT id, title, category, deadline::text, min_size, max_size,
                recommended_roles, tech_stack_hints, eligibility, summary,
                source_url, source_type, status, created_by,
                created_at::text, updated_at::text
         FROM public.competitions
         WHERE created_by = $1
           AND status IN ('pending_review', 'rejected')
         ORDER BY created_at DESC`,
        [user.id],
      );

      const compTeamMap = new Map<string, ConfirmedTeamRow>();
      for (const team of teamRes.rows) {
        compTeamMap.set(team.competition_id, team);
      }

      return {
        interests: interestRes.rows,
        teamByCompetition: compTeamMap,
        membersByTeam: membersMap,
        mySubmissions: subRes.rows,
      };
    });

  const assignedCount = teamByCompetition.size;
  const waitingCount = interests.length - assignedCount;

  return (
    <main className="w-full space-y-8 px-4 py-8 sm:px-6 lg:px-8 xl:px-10">
      <section className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl space-y-1.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground">
            ติดตามสถานะการเข้าร่วม
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            รายการที่ลงชื่อและทีมของฉัน
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ดูความคืบหน้าการจัดทีมและข้อมูลติดต่อเพื่อนร่วมทีมเมื่ออาจารย์ยืนยันแล้ว
            แตะชื่อเพื่อนร่วมทีมเพื่อดูโปรไฟล์แบบอ่านอย่างเดียว
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:items-end">
          <div className="flex items-center divide-x divide-border text-left sm:text-right">
            <div className="pr-4">
              <p className="font-mono text-base font-semibold tabular-nums text-foreground">
                {interests.length}
              </p>
              <p className="text-xs text-muted-foreground">ลงชื่อแล้ว</p>
            </div>
            <div className="px-4">
              <p className="font-mono text-base font-semibold tabular-nums text-primary">
                {assignedCount}
              </p>
              <p className="text-xs text-muted-foreground">ได้ทีมแล้ว</p>
            </div>
            <div className="pl-4">
              <p className="font-mono text-base font-semibold tabular-nums text-muted-foreground">
                {waitingCount}
              </p>
              <p className="text-xs text-muted-foreground">รอจัดกลุ่ม</p>
            </div>
          </div>

          <Button asChild variant="outline" size="sm" className="rounded-md">
            <Link href="/">ดูรายการแข่งขันทั้งหมด</Link>
          </Button>
        </div>
      </section>

      {interests.length === 0 && teamByCompetition.size === 0 ? (
        <div className="border-b border-border py-14 text-center">
          <p className="text-sm font-medium text-foreground">
            คุณยังไม่ได้ลงชื่อสนใจการแข่งขันใดๆ
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            เลือกดูรายการแข่งขันสาย Tech ที่กำลังเปิดรับสมัคร
            แล้วกดปุ่ม &ldquo;ลงชื่อสนใจแข่ง&rdquo; เพื่อให้อาจารย์จัดทีมให้คุณ
          </p>
          <div className="mt-5">
            <Button asChild size="sm" className="rounded-md">
              <Link href="/">สำรวจการแข่งขันสาย Tech</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {interests.length > 0 ? (
            <section className="space-y-4" aria-label="รายการที่ลงชื่อสนใจ">
              <div className="flex items-baseline justify-between border-b border-border pb-3">
                <h2 className="text-xs font-medium tracking-wide text-muted-foreground">
                  รายการที่คุณลงชื่อสนใจ
                </h2>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {interests.length} รายการ
                </span>
              </div>
              <div className="grid gap-4">
                {interests.map((item) => {
                  const confirmedTeam = teamByCompetition.get(item.competition_id);
                  return (
                    <MyTeamCard
                      key={item.competition_id}
                      interest={item}
                      confirmedTeam={confirmedTeam}
                      members={confirmedTeam ? (membersByTeam.get(confirmedTeam.team_id) ?? []) : []}
                      viewerId={user.id}
                    />
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {teamByCompetition.size > 0 ? (
        <section className="space-y-4 border-t border-border pt-8" aria-labelledby="confirmed-teams-title">
          <div>
            <h2 id="confirmed-teams-title" className="text-lg font-semibold">ทีมที่ได้รับการยืนยัน</h2>
            <p className="mt-1 text-sm text-muted-foreground">ข้อมูลเพื่อนร่วมทีมและอาจารย์ที่ปรึกษาสำหรับติดต่อทำงาน</p>
          </div>
          {Array.from(teamByCompetition.entries()).map(([competitionId, team]) => (
            <article key={team.team_id} className="space-y-3">
              <h3 className="text-base font-semibold">
                <Link href={`/competitions/${competitionId}`} className="hover:text-primary">ดูรายละเอียดการแข่งขัน</Link>
              </h3>
              <TeamMembers
                team={team}
                members={membersByTeam.get(team.team_id) ?? []}
                viewerId={user.id}
              />
            </article>
          ))}
        </section>
      ) : null}

      {mySubmissions.length > 0 ? (
        <section className="space-y-3 border-t border-border pt-8">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground">
            รายการแข่งขันที่คุณส่งให้ครูตรวจสอบ
          </h2>
          <div className="divide-y divide-border border-y border-border">
            {mySubmissions.map((sub) => {
              const statusMeta = COMPETITION_STATUS_META[sub.status];
              return (
                <div
                  key={sub.id}
                  className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">
                      {sub.title}
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      ปิดรับ {formatThaiDate(sub.deadline, "short")}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`${statusMeta.badgeClassName} w-fit rounded-md text-[11px] font-medium`}
                  >
                    {statusMeta.labelTh}
                  </Badge>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}
