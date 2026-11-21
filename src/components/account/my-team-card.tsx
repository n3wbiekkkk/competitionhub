import Link from "next/link";
import { ArrowUpRight, Check, Clock } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  COMPETITION_STATUS_META,
  STUDENT_TEAM_PROGRESS_LABELS_TH,
  TECH_CATEGORY_META,
  type CompetitionStatus,
  type TechCategory,
} from "@/lib/constants/tech-taxonomy";
import { getInitials } from "@/lib/utils/initials";
import { formatThaiDate, getDeadlineCountdown } from "@/lib/utils/thai-date";

export interface MyInterestRow {
  competition_id: string;
  preferred_role: string;
  note: string | null;
  title: string;
  category: TechCategory;
  deadline: string | null;
  comp_status: CompetitionStatus;
}

export interface ConfirmedTeamRow {
  team_id: string;
  team_name: string;
  competition_id: string;
  advisor_name: string | null;
  advisor_email: string | null;
  advisor_contact: string | null;
}

export interface ConfirmedMemberRow {
  team_id: string;
  user_id: string;
  assigned_role: string;
  full_name: string;
  nickname: string | null;
  grade: string | null;
  skills: string[];
  contact: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  email: string;
}

interface MyTeamCardProps {
  interest: MyInterestRow;
  confirmedTeam?: ConfirmedTeamRow;
  members: ConfirmedMemberRow[];
  viewerId: string;
}

interface TeamReadiness {
  score: number;
  label: string;
  note: string;
}

function teamReadiness(hasTeam: boolean, memberCount: number): TeamReadiness {
  if (!hasTeam) {
    return {
      score: 20,
      label: STUDENT_TEAM_PROGRESS_LABELS_TH.waiting,
      note: "ลงชื่อสนใจแล้ว · รออาจารย์จัดทีม",
    };
  }
  if (memberCount < 2) {
    return {
      score: 55,
      label: "กำลังจัดทีม",
      note: `สมาชิก ${memberCount} คน · ต้องการเพื่อนร่วมทีมเพิ่ม`,
    };
  }
  if (memberCount < 4) {
    return {
      score: 80,
      label: "ใกล้พร้อมทำงาน",
      note: `สมาชิก ${memberCount} คน · ทบทวนบทบาทในทีม`,
    };
  }
  return {
    score: 100,
    label: "พร้อมเริ่มงาน",
    note: `สมาชิก ${memberCount} คน · สามารถเริ่มวางแผนได้`,
  };
}

function MemberAvatar({
  member,
  viewerId,
}: {
  member: ConfirmedMemberRow;
  viewerId: string;
}) {
  const isSelf = member.user_id === viewerId;
  const displayName = `${member.full_name}${member.nickname ? ` (${member.nickname})` : ""}${isSelf ? " (คุณ)" : ""}`;
  const avatar = (
    <Avatar className="size-9 ring-2 ring-background">
      <AvatarFallback className="bg-sage font-mono text-[11px] font-semibold tabular-nums text-sage-foreground">
        {getInitials(member.full_name, member.nickname ?? "")}
      </AvatarFallback>
    </Avatar>
  );

  if (isSelf) {
    return <span title={displayName}>{avatar}</span>;
  }

  return (
    <Link
      href={`/people/${member.user_id}`}
      aria-label={`ดูโปรไฟล์ ${member.full_name}`}
      title={displayName}
      className="rounded-full transition-opacity hover:opacity-80"
    >
      {avatar}
    </Link>
  );
}

export function MyTeamCard({
  interest,
  confirmedTeam,
  members,
  viewerId,
}: MyTeamCardProps) {
  const category = TECH_CATEGORY_META[interest.category];
  const competitionStatus = COMPETITION_STATUS_META[interest.comp_status];
  const countdown = getDeadlineCountdown(interest.deadline);
  const readiness = teamReadiness(Boolean(confirmedTeam), members.length);
  const assigned = Boolean(confirmedTeam);

  return (
    <article className="specular-card overflow-hidden rounded-xl border border-border bg-card p-6">
      <div className="space-y-5">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">{category.shortLabel}</span>
            <span aria-hidden="true">·</span>
            <span>บทบาท: {interest.preferred_role}</span>
          </div>

          <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            <Link
              href={`/competitions/${interest.competition_id}`}
              className="transition-colors hover:text-primary"
            >
              {interest.title}
            </Link>
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={`h-auto rounded-md ${competitionStatus.badgeClassName}`}
            >
              {competitionStatus.labelTh}
            </Badge>
            <Badge
              variant="outline"
              className={`h-auto gap-1 rounded-md ${assigned ? "border-primary/25 bg-primary/10 text-primary" : ""}`}
            >
              {assigned ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              {assigned
                ? STUDENT_TEAM_PROGRESS_LABELS_TH.assigned
                : STUDENT_TEAM_PROGRESS_LABELS_TH.waiting}
            </Badge>
            <Link
              href={`/my-teams/${interest.competition_id}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline underline-offset-4"
            >
              จัดทีมและหาเพื่อนร่วมทีม
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="space-y-4 border-t border-border pt-4">
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              กำหนดปิดรับถัดไป
            </p>
            <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-border bg-background px-2.5 py-1 font-mono text-xs tabular-nums text-foreground">
              <Clock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
              {formatThaiDate(interest.deadline, "long")}
              <span className="text-muted-foreground">· {countdown.label}</span>
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs font-medium text-foreground">ความคืบหน้าการตั้งทีม</p>
              <span className="font-mono text-sm font-semibold tabular-nums text-primary">
                {readiness.score}%
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="ความคืบหน้าการตั้งทีม"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={readiness.score}
              aria-valuetext={`${readiness.label} ${readiness.score}%`}
              className="h-2 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${readiness.score}%` }}
              />
            </div>
            <p className="text-xs leading-[1.65] tabular-nums text-muted-foreground">
              <span className="font-medium text-foreground">{readiness.label}</span>
              {" · "}
              {readiness.note}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex -space-x-2">
            {members.length > 0 ? (
              members.slice(0, 5).map((member) => (
                <MemberAvatar key={member.user_id} member={member} viewerId={viewerId} />
              ))
            ) : (
              <Avatar className="size-9 ring-2 ring-background">
                <AvatarFallback className="bg-muted font-mono text-[11px] tabular-nums text-muted-foreground">
                  ?
                </AvatarFallback>
              </Avatar>
            )}
            {members.length > 5 ? (
              <span className="flex size-9 items-center justify-center rounded-full bg-muted font-mono text-[11px] tabular-nums text-muted-foreground ring-2 ring-background">
                +{members.length - 5}
              </span>
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {confirmedTeam ? `ทีม: ${confirmedTeam.team_name}` : "ยังไม่มีทีมที่ยืนยัน"}
            </p>
            <p className="truncate text-xs leading-[1.65] tabular-nums text-muted-foreground">
              {confirmedTeam
                ? `อาจารย์ที่ปรึกษา: ${confirmedTeam.advisor_name ?? "ยังไม่ระบุ"} · สมาชิก ${members.length} คน`
                : "อาจารย์กำลังรวบรวมรายชื่อผู้สนใจเพื่อจัดทีม"}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
