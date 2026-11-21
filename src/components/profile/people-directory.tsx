"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, RotateCcw, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PeopleBadgeStrip } from "@/components/badges/people-badge-strip";
import type { UserBadge } from "@/lib/db/badges";
import { getInitials } from "@/lib/utils/initials";
import { parseClassroom } from "@/lib/constants/classroom";
import { USER_ROLE_LABELS_TH } from "@/lib/constants/tech-taxonomy";
import type { DirectoryProfile } from "@/types/database";

interface PeopleDirectoryProps {
  people: DirectoryProfile[];
  viewerId: string;
  initialQuery: string;
  badgesByUser?: Record<string, UserBadge[]>;
}

function displayName(person: DirectoryProfile): string {
  return person.nickname
    ? `${person.full_name} (${person.nickname})`
    : person.full_name;
}

export function PeopleDirectory({
  people,
  viewerId,
  initialQuery,
  badgesByUser = {},
}: PeopleDirectoryProps) {
  const [query, setQuery] = useState(initialQuery);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return people;
    return people.filter((person) => {
      const haystack = [
        person.full_name,
        person.nickname ?? "",
        ...person.skills,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [people, query]);

  return (
    <section className="space-y-5">
      <div className="relative max-w-xl">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="ค้นหาชื่อหรือทักษะ"
          placeholder="ค้นหาชื่อหรือทักษะ เช่น Python, Figma"
          className="h-11 rounded-xl pl-9 text-sm sm:h-9"
        />
      </div>

      <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
        แสดง <strong className="font-medium text-foreground">{filtered.length}</strong>{" "}
        จาก {people.length} คน
      </p>

      {filtered.length === 0 ? (
        <div className="border-y border-border py-14 text-center">
          <p className="text-sm font-medium text-foreground">
            {people.length === 0
              ? "ยังไม่มีผู้คนที่เปิดเผยโปรไฟล์"
              : "ไม่พบผู้คนที่ตรงกับคำค้นหา"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {people.length === 0
              ? "ให้เพื่อนเปิดการค้นพบโปรไฟล์ในหน้าโปรไฟล์ แล้วกลับมาดูใหม่"
              : "ลองค้นหาด้วยชื่อเล่นหรือทักษะอื่น"}
          </p>
          {query ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQuery("")}
              className="mt-5 gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" /> ล้างคำค้นหา
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((person) => {
            const classroom = parseClassroom(person.grade);
            const classroomLabel = classroom.gradeLevel
              ? `${classroom.gradeLevel}${classroom.room ? `/${classroom.room}` : ""}`
              : "ไม่ระบุห้องเรียน";
            const skills = person.skills.slice(0, 4);
            const extra = person.skills.length - skills.length;
            const isSelf = person.id === viewerId;
            const href = isSelf ? "/profile" : `/people/${person.id}`;
            const badges = badgesByUser[person.id] ?? [];
            const hasVerifiedSkillBadge = badges.some(
              (badge) => badge.criterion === "verified_skill_count",
            );

            return (
              <li
                key={person.id}
                className="flex min-w-0 flex-col rounded-xl border border-border bg-background p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <Avatar className="size-14 rounded-2xl">
                    {person.avatar_url ? (
                      <AvatarImage src={person.avatar_url} alt="" className="rounded-2xl" />
                    ) : null}
                    <AvatarFallback className="rounded-2xl bg-sage font-mono text-base font-semibold tabular-nums text-sage-foreground">
                      {getInitials(person.full_name, person.nickname ?? "")}
                    </AvatarFallback>
                  </Avatar>
                  <Badge
                    variant="outline"
                    className="h-auto rounded-md bg-muted/40 px-2 py-1 font-mono text-[11px] font-medium tabular-nums text-foreground/80"
                  >
                    {classroomLabel}
                  </Badge>
                </div>

                <p className="mt-4 truncate text-sm font-semibold text-foreground">
                  {displayName(person)}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {person.role === "teacher" ? (
                    <Badge
                      variant="secondary"
                      className="h-auto rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                    >
                      {USER_ROLE_LABELS_TH[person.role]}
                    </Badge>
                  ) : null}
                  <PeopleBadgeStrip badges={badges} />
                </div>

                <div className="mt-4 flex-1 border-t border-border pt-4">
                  {skills.length > 0 ? (
                    <div className="space-y-2">
                      <p
                        className={`flex items-center gap-1.5 text-[11px] font-medium ${
                          hasVerifiedSkillBadge ? "text-primary" : "text-muted-foreground"
                        }`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {hasVerifiedSkillBadge
                          ? "ทักษะที่มีหลักฐานรับรอง"
                          : "ทักษะจากโปรไฟล์"}
                      </p>
                      <ul className="flex flex-wrap gap-1.5" aria-label="ทักษะ">
                        {skills.map((skill) => (
                          <li key={skill}>
                            <Badge
                              variant="secondary"
                              className="h-auto rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-normal text-foreground/80"
                            >
                              {skill}
                            </Badge>
                          </li>
                        ))}
                        {extra > 0 ? (
                          <li>
                            <Badge
                              variant="outline"
                              className="h-auto rounded-md px-1.5 py-0.5 font-mono text-[11px] font-normal tabular-nums text-muted-foreground"
                            >
                              +{extra}
                            </Badge>
                          </li>
                        ) : null}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">ยังไม่ได้ระบุทักษะ</p>
                  )}
                </div>

                <Button
                  asChild
                  size="sm"
                  className="mt-5 h-9 w-full gap-1.5 rounded-lg px-3 text-xs"
                >
                  <Link href={href}>
                    {isSelf ? "โปรไฟล์ของฉัน" : "ดูโปรไฟล์"}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
