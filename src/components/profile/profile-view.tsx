import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  GitBranch,
  GraduationCap,
  Hash,
  Mail,
  MessageCircle,
} from "lucide-react";
import { AccountSection } from "@/components/account/account-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/initials";
import { parseClassroom } from "@/lib/constants/classroom";
import {
  SOCIAL_HOSTS,
  isValidProfileLink,
} from "@/lib/utils/profile-links";
import {
  USER_ROLE_LABELS_TH,
} from "@/lib/constants/tech-taxonomy";
import type { DirectoryPersonProfile } from "@/types/database";

interface SafeLink {
  href: string;
  label: string;
  icon: typeof GitBranch;
}

export function ProfileView({ profile }: { profile: DirectoryPersonProfile }) {
  const classroom = parseClassroom(profile.grade);
  const classroomLabel = classroom.gradeLevel
    ? `${classroom.gradeLevel}${classroom.room ? `/${classroom.room}` : ""}`
    : "ไม่ระบุห้องเรียน";
  const skills = profile.skills;
  const displayName = profile.nickname
    ? `${profile.full_name} (${profile.nickname})`
    : profile.full_name;

  const links: SafeLink[] = [];
  if (isValidProfileLink(profile.github_url, SOCIAL_HOSTS.github)) {
    links.push({ href: profile.github_url!, label: "GitHub", icon: GitBranch });
  }
  if (isValidProfileLink(profile.portfolio_url)) {
    links.push({ href: profile.portfolio_url!, label: "ผลงาน", icon: ExternalLink });
  }
  if (isValidProfileLink(profile.discord_url, SOCIAL_HOSTS.discord)) {
    links.push({ href: profile.discord_url!, label: "Discord", icon: Hash });
  }
  if (isValidProfileLink(profile.line_url, SOCIAL_HOSTS.line)) {
    links.push({ href: profile.line_url!, label: "LINE", icon: MessageCircle });
  }

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
            <p className="text-xs font-medium uppercase tracking-widest text-primary">
              โปรไฟล์สำหรับจัดทีม
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {displayName}
            </h1>
            <p className="flex items-center gap-1.5 font-mono text-sm tabular-nums text-muted-foreground">
              <GraduationCap className="h-4 w-4" aria-hidden="true" />
              {classroomLabel}
            </p>
            <Badge
              variant="secondary"
              className="mt-1 h-auto rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
            >
              {USER_ROLE_LABELS_TH[profile.role]}
            </Badge>
          </div>
        </div>
      </section>

      <AccountSection
        title="เกี่ยวกับฉัน"
        description="สิ่งที่เจ้าของโปรไฟล์เล่าไว้สำหรับการจับคู่ทีม"
      >
        {profile.bio && profile.bio.trim() ? (
          <p className="whitespace-pre-line text-sm leading-7 text-foreground/85">
            {profile.bio}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">ยังไม่ได้เขียนเกี่ยวกับฉัน</p>
        )}
      </AccountSection>

      <AccountSection
        title="ทักษะและเครื่องมือ"
        description="ภาษา เฟรมเวิร์ก และเครื่องมือที่ใช้งานได้จริง"
      >
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
      </AccountSection>

      <AccountSection
        title="ผลงานและลิงก์"
        description="ลิงก์ไปยังโค้ด ผลงาน หรือช่องทางที่เจ้าของโปรไฟล์เปิดไว้"
      >
        {links.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {links.map((link) => {
              const Icon = link.icon;
              return (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-muted"
                  >
                    <Icon className="h-4 w-4" />
                    {link.label}
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </a>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">ยังไม่ได้เพิ่มลิงก์ผลงาน</p>
        )}
      </AccountSection>

      <AccountSection
        title="การติดต่อ"
        description="ช่องทางที่เจ้าของโปรไฟล์อนุญาตให้ผู้อื่นเห็น"
      >
        {profile.contact && profile.contact.trim() ? (
          <p className="inline-flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="whitespace-pre-line break-all">{profile.contact}</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">ยังไม่ได้ระบุช่องทางติดต่อ</p>
        )}
      </AccountSection>

      <section className="border-t border-border pt-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          ข้อมูลในหน้านี้เปิดเผยเพื่อช่วยจัดทีมตามที่เจ้าของโปรไฟล์อนุญาต
          อีเมลของเจ้าของโปรไฟล์จะไม่แสดง
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
