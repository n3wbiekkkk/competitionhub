"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
        <ul className="divide-y divide-border md:grid md:grid-cols-2 md:gap-4 md:divide-y-0 xl:grid-cols-3">
          {filtered.map((person) => {
            const classroom = parseClassroom(person.grade);
            const classroomLabel = classroom.gradeLevel
              ? `${classroom.gradeLevel}${classroom.room ? `/${classroom.room}` : ""}`
              : "ไม่ระบุห้องเรียน";
            const skills = person.skills.slice(0, 4);
            const extra = person.skills.length - skills.length;
            const isSelf = person.id === viewerId;
            const href = isSelf ? "/profile" : `/people/${person.id}`;

            return (
              <li
                key={person.id}
                className="flex min-w-0 items-center gap-3 border-b border-border py-3 last:border-b-0 md:flex-col md:items-start md:rounded-xl md:border md:bg-card md:p-4 md:py-4 md:last:border-b"
              >
                <Avatar className="size-10 shrink-0 md:size-11">
                  {person.avatar_url ? (
                    <AvatarImage src={person.avatar_url} alt="" />
                  ) : null}
                  <AvatarFallback className="bg-sage font-mono text-xs font-semibold tabular-nums text-sage-foreground">
                    {getInitials(person.full_name, person.nickname ?? "")}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 md:w-full">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {displayName(person)}
                  </p>
                  <p className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                    {classroomLabel}
                  </p>
                  {person.role === "teacher" ? (
                    <Badge variant="secondary" className="mt-2 h-auto rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      {USER_ROLE_LABELS_TH[person.role]}
                    </Badge>
                  ) : null}
                  <PeopleBadgeStrip badges={badgesByUser[person.id] ?? []} />
                  {skills.length > 0 ? (
                    <ul className="mt-2 hidden flex-wrap gap-1 md:flex" aria-label="ทักษะ">
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
                  ) : (
                    <p className="mt-2 hidden text-xs text-muted-foreground md:block">
                      ยังไม่ได้ระบุทักษะ
                    </p>
                  )}
                </div>
                <Button
                  asChild
                  size="sm"
                  className="h-9 shrink-0 gap-1.5 rounded-lg px-3 text-xs md:mt-auto md:w-full"
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
