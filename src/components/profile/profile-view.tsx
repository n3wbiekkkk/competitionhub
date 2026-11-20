import Link from "next/link";
import { ArrowLeft, GraduationCap, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/initials";
import { parseClassroom } from "@/lib/constants/classroom";
import { TECH_SKILLS, USER_ROLE_LABELS_TH } from "@/lib/constants/tech-taxonomy";
import type { DirectoryProfile } from "@/types/database";

const PRESET_SKILLS = new Set<string>(TECH_SKILLS);

export function ProfileView({ profile }: { profile: DirectoryProfile }) {
  const classroom = parseClassroom(profile.grade);
  const classroomLabel = classroom.gradeLevel
    ? `${classroom.gradeLevel}${classroom.room ? `/${classroom.room}` : ""}`
    : "ไม่ระบุห้องเรียน";
  const skills = profile.skills.filter((skill) => PRESET_SKILLS.has(skill));
  const displayName = profile.nickname
    ? `${profile.full_name} (${profile.nickname})`
    : profile.full_name;

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 border-b border-border pb-7 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Avatar className="size-16 rounded-2xl">
            {profile.avatar_url ? (
              <AvatarImage src={profile.avatar_url} alt="" className="rounded-2xl" />
            ) : null}
            <AvatarFallback className="bg-sage font-mono text-lg font-semibold tabular-nums text-sage-foreground">
              {getInitials(profile.full_name, profile.nickname ?? "")}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-sage px-2.5 py-1 text-[11px] font-medium text-sage-foreground">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              โปรไฟล์แบบอ่านอย่างเดียว
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {displayName}
            </h1>
            <p className="flex items-center gap-1.5 font-mono text-sm tabular-nums text-muted-foreground">
              <GraduationCap className="h-4 w-4" aria-hidden="true" />
              {classroomLabel}
            </p>
            <Badge variant="secondary" className="mt-1 h-auto rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {USER_ROLE_LABELS_TH[profile.role]}
            </Badge>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          ทักษะและเครื่องมือ
        </h2>
        {skills.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {skills.map((skill) => (
              <li key={skill}>
                <Badge
                  variant="secondary"
                  className="h-auto rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs font-normal text-foreground/80"
                >
                  {skill}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">ยังไม่ได้ระบุทักษะ</p>
        )}
      </section>

      <section className="border-t border-border pt-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          ข้อมูลติดต่อและลิงก์ส่วนตัวจะแสดงเฉพาะในหน้าทีมที่อาจารย์ยืนยันแล้ว
          โปรไฟล์นี้เปิดเผยเพื่อช่วยจัดทีมเท่านั้น
        </p>
        <Button asChild variant="outline" className="mt-5 gap-2 rounded-lg">
          <Link href="/people">
            <ArrowLeft className="h-4 w-4" /> กลับไปหน้าผู้คน
          </Link>
        </Button>
      </section>
    </div>
  );
}
