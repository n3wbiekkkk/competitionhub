"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ExternalLink,
  Plus,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { SmartAddModal } from "@/components/competitions/smart-add-modal";
import { AiDiscoveryPanel } from "@/components/competitions/ai-discovery-panel";
import { getCategoryIcon } from "@/components/competitions/category-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TECH_CATEGORIES,
  TECH_CATEGORY_META,
  type TechCategory,
  type UserRole,
} from "@/lib/constants/tech-taxonomy";
import {
  formatThaiDate,
  getDeadlineCountdown,
} from "@/lib/utils/thai-date";
import type { Competition } from "@/types/database";

export interface FeedCompetitionItem extends Competition {
  interest_count: number;
  my_preferred_role: string | null;
}

export type TeamSizeFilter = "all" | "solo" | "small" | "large";
export type TargetLevelFilter = "all" | "high_school" | "university" | "public";
export type SortOption = "deadline_asc" | "popular" | "newest" | "match";

export interface InitialFeedFilters {
  status: "open" | "closed";
  category: "all" | TechCategory;
  level: TargetLevelFilter;
  size: TeamSizeFilter;
  sort: SortOption;
  q: string;
  match: boolean;
}

interface CompetitionFeedProps {
  competitions: FeedCompetitionItem[];
  userRole: UserRole | null;
  userSkills?: string[];
  initialFilters?: Partial<InitialFeedFilters>;
  todayIso: string;
}

function tokenizeSkill(rawSkill: string): {
  full: string;
  tokens: string[];
} {
  const full = rawSkill.trim().toLowerCase();
  const split = full
    .split(/[/,\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const tokens = Array.from(new Set([full, ...split]));
  return { full, tokens };
}

function hintMatchesSkillTokens(hintLower: string, tokens: string[]): boolean {
  for (const token of tokens) {
    if (token.length === 1) {
      if (hintLower === token) return true;
      continue;
    }
    if (hintLower.includes(token) || token.includes(hintLower)) {
      return true;
    }
  }
  return false;
}

function computeMatchedTech(
  comp: FeedCompetitionItem,
  userSkills: string[],
): { matchedHints: Set<string>; matchedCount: number } {
  const matchedHints = new Set<string>();
  if (userSkills.length === 0) {
    return { matchedHints, matchedCount: 0 };
  }

  const parsedSkills = userSkills
    .map(tokenizeSkill)
    .filter((entry) => entry.full.length > 0);
  const secondaryHaystack = [
    ...comp.recommended_roles,
    comp.summary ?? "",
  ]
    .join(" ")
    .toLowerCase();

  let matchedSkillCount = 0;

  for (const { tokens } of parsedSkills) {
    let skillMatched = false;

    for (const hint of comp.tech_stack_hints) {
      const hintLower = hint.trim().toLowerCase();
      if (hintLower && hintMatchesSkillTokens(hintLower, tokens)) {
        matchedHints.add(hint);
        skillMatched = true;
      }
    }

    if (!skillMatched) {
      for (const token of tokens) {
        if (token.length >= 2 && secondaryHaystack.includes(token)) {
          skillMatched = true;
          break;
        }
      }
    }

    if (skillMatched) {
      matchedSkillCount += 1;
    }
  }

  return {
    matchedHints,
    matchedCount: Math.max(matchedHints.size, matchedSkillCount),
  };
}

function matchesTargetLevel(
  comp: FeedCompetitionItem,
  level: TargetLevelFilter,
): boolean {
  if (level === "all") return true;
  const haystack =
    `${comp.eligibility ?? ""} ${comp.title} ${comp.summary ?? ""}`.toLowerCase();

  switch (level) {
    case "high_school":
      return (
        haystack.includes("มัธยม") ||
        haystack.includes("ม.ปลาย") ||
        haystack.includes("ม.ต้น") ||
        haystack.includes("ปวช") ||
        haystack.includes("high school") ||
        haystack.includes("เยาวชน")
      );
    case "university":
      return (
        haystack.includes("มหาวิทยาลัย") ||
        haystack.includes("นิสิต") ||
        haystack.includes("นักศึกษา") ||
        haystack.includes("อุดมศึกษา") ||
        haystack.includes("ป.ตรี") ||
        haystack.includes("ปวส") ||
        haystack.includes("university")
      );
    case "public":
      return (
        haystack.includes("บุคคลทั่วไป") ||
        haystack.includes("ประชาชน") ||
        haystack.includes("ทุกระดับ") ||
        haystack.includes("ทุกช่วงวัย") ||
        haystack.includes("public") ||
        haystack.includes("general")
      );
  }
}

export function CompetitionFeed({
  competitions,
  userRole,
  userSkills = [],
  initialFilters,
  todayIso,
}: CompetitionFeedProps) {
  const hasUserSkills = userSkills.length > 0;
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [statusTab, setStatusTab] = useState<"open" | "closed">(
    initialFilters?.status ?? "open",
  );
  const [selectedCategory, setSelectedCategory] = useState<
    "all" | TechCategory
  >(initialFilters?.category ?? "all");
  const [levelFilter, setLevelFilter] = useState<TargetLevelFilter>(
    initialFilters?.level ?? "all",
  );
  const [teamSizeFilter, setTeamSizeFilter] = useState<TeamSizeFilter>(
    initialFilters?.size ?? "all",
  );
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    const initSort = initialFilters?.sort ?? "deadline_asc";
    if (initSort === "match" && !hasUserSkills) {
      return "deadline_asc";
    }
    return initSort;
  });
  const [searchQuery, setSearchQuery] = useState(initialFilters?.q ?? "");
  const [onlySkillMatch, setOnlySkillMatch] = useState(
    hasUserSkills ? (initialFilters?.match ?? false) : false,
  );
  const [smartModalOpen, setSmartModalOpen] = useState(false);

  // Global "/" shortcut to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        const tag = active.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          active.isContentEditable
        ) {
          return;
        }
      }
      e.preventDefault();
      searchInputRef.current?.focus();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Sync non-default filters cleanly to URL query string
  useEffect(() => {
    const params = new URLSearchParams();
    if (statusTab !== "open") params.set("status", statusTab);
    if (selectedCategory !== "all") params.set("category", selectedCategory);
    if (levelFilter !== "all") params.set("level", levelFilter);
    if (teamSizeFilter !== "all") params.set("size", teamSizeFilter);
    if (sortBy !== "deadline_asc") params.set("sort", sortBy);
    if (searchQuery.trim().length > 0) params.set("q", searchQuery.trim());
    if (hasUserSkills && onlySkillMatch) params.set("match", "1");

    const serialized = params.toString();
    const nextSearch = serialized ? `?${serialized}` : "";
    if (window.location.search !== nextSearch) {
      const nextUrl = `${window.location.pathname}${nextSearch}`;
      window.history.replaceState(null, "", nextUrl);
    }
  }, [
    statusTab,
    selectedCategory,
    levelFilter,
    teamSizeFilter,
    sortBy,
    searchQuery,
    onlySkillMatch,
    hasUserSkills,
  ]);

  const openItems = useMemo(
    () => competitions.filter((c) => c.status === "open"),
    [competitions],
  );
  const closedCount = useMemo(
    () => competitions.filter((c) => c.status === "closed").length,
    [competitions],
  );

  const urgentSpotlight = useMemo(() => {
    return openItems
      .map((comp) => ({
        comp,
        countdown: getDeadlineCountdown(comp.deadline, todayIso),
      }))
      .filter(
        ({ countdown }) =>
          countdown.kind === "today" ||
          (countdown.daysRemaining !== null &&
            countdown.daysRemaining >= 0 &&
            countdown.daysRemaining <= 14),
      )
      .sort(
        (a, b) =>
          (a.countdown.daysRemaining ?? 999) -
          (b.countdown.daysRemaining ?? 999),
      )
      .slice(0, 3);
  }, [openItems, todayIso]);

  const competitionYear = Number(todayIso.slice(0, 4)) + 543;

  const statusScoped = useMemo(
    () =>
      competitions.filter((c) => {
        if (c.status !== statusTab) return false;
        return (
          statusTab !== "open" ||
          getDeadlineCountdown(c.deadline, todayIso).kind !== "expired"
        );
      }),
    [competitions, statusTab, todayIso],
  );

  const categoryCounts = useMemo(() => {
    const map = new Map<TechCategory, number>();
    for (const cat of TECH_CATEGORIES) {
      map.set(cat, 0);
    }
    for (const comp of statusScoped) {
      map.set(comp.category, (map.get(comp.category) ?? 0) + 1);
    }
    return map;
  }, [statusScoped]);

  const skillMatchById = useMemo(() => {
    const map = new Map<
      string,
      { matchedHints: Set<string>; matchedCount: number }
    >();
    if (!hasUserSkills) return map;
    for (const comp of competitions) {
      map.set(comp.id, computeMatchedTech(comp, userSkills));
    }
    return map;
  }, [competitions, userSkills, hasUserSkills]);

  const filteredCompetitions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const matched = statusScoped.filter((comp) => {
      if (selectedCategory !== "all" && comp.category !== selectedCategory) {
        return false;
      }

      if (!matchesTargetLevel(comp, levelFilter)) {
        return false;
      }

      if (
        teamSizeFilter === "solo" &&
        !(comp.min_size === 1 && comp.max_size === 1)
      ) {
        return false;
      }
      if (
        teamSizeFilter === "small" &&
        !(comp.max_size >= 2 && comp.min_size <= 3)
      ) {
        return false;
      }
      if (teamSizeFilter === "large" && comp.max_size < 4) {
        return false;
      }

      if (hasUserSkills && onlySkillMatch) {
        const matchInfo = skillMatchById.get(comp.id);
        if (!matchInfo || matchInfo.matchedCount === 0) {
          return false;
        }
      }

      if (q.length > 0) {
        const haystack = [
          comp.title,
          comp.category,
          comp.summary ?? "",
          comp.eligibility ?? "",
          ...comp.recommended_roles,
          ...comp.tech_stack_hints,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) {
          return false;
        }
      }

      return true;
    });

    return [...matched].sort((a, b) => {
      if (sortBy === "match" && hasUserSkills) {
        const ma = skillMatchById.get(a.id)?.matchedCount ?? 0;
        const mb = skillMatchById.get(b.id)?.matchedCount ?? 0;
        if (mb !== ma) return mb - ma;
      } else if (sortBy === "popular") {
        if (b.interest_count !== a.interest_count) {
          return b.interest_count - a.interest_count;
        }
      } else if (sortBy === "newest") {
        return b.created_at.localeCompare(a.created_at);
      }

      const da = a.deadline ?? "9999-12-31";
      const db = b.deadline ?? "9999-12-31";
      if (da !== db) return da.localeCompare(db);
      return b.created_at.localeCompare(a.created_at);
    });
  }, [
    statusScoped,
    selectedCategory,
    levelFilter,
    teamSizeFilter,
    searchQuery,
    sortBy,
    hasUserSkills,
    onlySkillMatch,
    skillMatchById,
  ]);

  const hasActiveFilters =
    selectedCategory !== "all" ||
    levelFilter !== "all" ||
    teamSizeFilter !== "all" ||
    onlySkillMatch ||
    searchQuery.trim().length > 0;

  function resetFilters() {
    setSelectedCategory("all");
    setLevelFilter("all");
    setTeamSizeFilter("all");
    setOnlySkillMatch(false);
    setSearchQuery("");
  }

  return (
    <div className="space-y-8">
      {/* Header: search-first instead of stats-first */}
      <section className="space-y-5">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-widest text-primary">
            ฐานข้อมูลการแข่งขันในประเทศไทย
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl sm:leading-[1.2]">
            การแข่งขันคอมพิวเตอร์และเทคโนโลยี
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            คัดเฉพาะเวทีในไทยด้านซอฟต์แวร์ AI ความปลอดภัยไซเบอร์ หุ่นยนต์
            และนวัตกรรมดิจิทัล พร้อมลงชื่อตามบทบาทเพื่อจัดทีม
          </p>
        </div>
        <AiDiscoveryPanel userSkills={userSkills} />
      </section>

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-4 border-y border-border py-3 sm:gap-6">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xl font-bold tabular-nums text-primary">{openItems.length}</span>
          <span className="text-xs text-muted-foreground">เปิดรับสมัคร</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xl font-bold tabular-nums text-peach-foreground">{urgentSpotlight.length}</span>
          <span className="text-xs text-muted-foreground">ปิดใน 14 วัน</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xl font-bold tabular-nums text-muted-foreground">{closedCount}</span>
          <span className="text-xs text-muted-foreground">คลังปี {competitionYear}</span>
        </div>
        {userRole ? (
          <Button
            size="sm"
            className="ml-auto gap-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setSmartModalOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" /> เพิ่มรายการ
          </Button>
        ) : (
          <Button asChild size="sm" className="ml-auto gap-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href="/login">เข้าสู่ระบบเพื่อลงชื่อแข่ง<ArrowRight className="h-3.5 w-3.5" /></Link>
          </Button>
        )}
      </div>

      {userRole ? (
        <SmartAddModal
          userRole={userRole}
          open={smartModalOpen}
          onOpenChange={setSmartModalOpen}
        />
      ) : null}

      {/* Closing Soon Hairline Strip */}
      {statusTab === "open" && !hasActiveFilters && urgentSpotlight.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground">
            ปิดรับสมัครภายใน 14 วัน
          </h2>
          <div className="grid divide-y divide-border border-y border-border md:grid-cols-3 md:divide-x md:divide-y-0">
            {urgentSpotlight.map(({ comp, countdown }) => {
              const catMeta = TECH_CATEGORY_META[comp.category];
              const countdownText =
                countdown.daysRemaining === 0
                  ? "วันนี้"
                  : `อีก ${countdown.daysRemaining ?? 0} วัน`;

              return (
                <Link
                  key={`urgent-${comp.id}`}
                  href={`/competitions/${comp.id}`}
                  className="group flex items-start justify-between gap-4 py-4 transition-colors hover:bg-muted/30 md:px-5 md:first:pl-0 md:last:pr-0"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {catMeta.shortLabel}
                    </p>
                    <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
                      {comp.title}
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      ปิดรับ {formatThaiDate(comp.deadline, "short")} · สนใจ{" "}
                      {comp.interest_count} คน
                    </p>
                  </div>

                  <span className="shrink-0 pt-0.5 font-mono text-xs font-semibold whitespace-nowrap tabular-nums text-primary">
                    {countdownText}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Canvas Filter Controls */}
      <section className="space-y-4 border-b border-border pb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs
            value={statusTab}
            onValueChange={(value) =>
              setStatusTab(value === "closed" ? "closed" : "open")
            }
          >
            <TabsList
              variant="line"
              className="h-auto gap-6 rounded-none bg-transparent p-0 group-data-horizontal/tabs:h-auto"
            >
              <TabsTrigger
                value="open"
                className="flex-none gap-2 rounded-none px-0 pb-2 text-sm font-medium after:bg-primary group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold"
              >
                <span>กำลังเปิดรับสมัคร</span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {openItems.length}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="closed"
                className="flex-none gap-2 rounded-none px-0 pb-2 text-sm font-medium after:bg-primary group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold"
              >
                <span>ปิดรับแล้ว (คลังปี {competitionYear})</span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {closedCount}
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:w-64 lg:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                type="search"
                aria-label="ค้นหารายการแข่งขัน"
                placeholder="ค้นหาชื่อรายการ, ผู้จัด, หรือเทคโนโลยี เช่น Arduino, CTF, มจธ."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    if (searchQuery.length > 0) {
                      setSearchQuery("");
                    } else {
                      e.currentTarget.blur();
                    }
                  }
                }}
                className="h-9 rounded-md pl-8 pr-8 text-sm"
              />
              {searchQuery.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="ล้างคำค้นหา"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
                  /
                </kbd>
              )}
            </div>

            <Select
              value={teamSizeFilter}
              onValueChange={(value) => {
                if (
                  value === "all" ||
                  value === "solo" ||
                  value === "small" ||
                  value === "large"
                ) {
                  setTeamSizeFilter(value);
                }
              }}
            >
              <SelectTrigger aria-label="กรองตามขนาดทีม" className="h-9 w-full rounded-md sm:w-36">
                <SelectValue placeholder="ขนาดทีม" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกขนาดทีม</SelectItem>
                <SelectItem value="solo">แข่งเดี่ยว (1 คน)</SelectItem>
                <SelectItem value="small">ทีมเล็ก (2–3 คน)</SelectItem>
                <SelectItem value="large">ทีมใหญ่ (4+ คน)</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={sortBy}
              onValueChange={(value) => {
                if (
                  value === "deadline_asc" ||
                  value === "popular" ||
                  value === "newest" ||
                  value === "match"
                ) {
                  setSortBy(value);
                }
              }}
            >
              <SelectTrigger aria-label="เรียงลำดับรายการ" className="h-9 w-full rounded-md sm:w-44">
                <SelectValue placeholder="เรียงตาม" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deadline_asc">ใกล้ปิดรับสมัครสุด</SelectItem>
                {hasUserSkills ? (
                  <SelectItem value="match">ตรงทักษะมากสุด</SelectItem>
                ) : null}
                <SelectItem value="popular">ได้รับความสนใจสูงสุด</SelectItem>
                <SelectItem value="newest">เพิ่มล่าสุด</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mr-1">หมวด</span>
          {(
            [
              { id: "all", label: "ทุกระดับ" },
              { id: "high_school", label: "ม.ปลาย" },
              { id: "university", label: "มหาวิทยาลัย" },
              { id: "public", label: "บุคคลทั่วไป" },
            ] as const
          ).map((lvl) => {
            const active = levelFilter === lvl.id;
            return (
              <button
                key={lvl.id}
                type="button"
                aria-pressed={active}
                onClick={() => setLevelFilter(lvl.id)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                {lvl.label}
              </button>
            );
          })}

          {hasUserSkills ? (
            <button
              type="button"
              aria-pressed={onlySkillMatch}
              onClick={() => setOnlySkillMatch((prev) => !prev)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                onlySkillMatch
                  ? "border-primary bg-primary/8 text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              ตรงทักษะฉัน
            </button>
          ) : null}

          <span
            aria-hidden="true"
            className="mx-1.5 hidden h-4 w-px bg-border sm:inline-block"
          />

          <button
            type="button"
            aria-pressed={selectedCategory === "all"}
            onClick={() => setSelectedCategory("all")}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
              selectedCategory === "all"
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            ทั้งหมด{" "}
            <span className="ml-0.5 font-mono tabular-nums opacity-75">
              {statusScoped.length}
            </span>
          </button>

          {TECH_CATEGORIES.map((category) => {
            const meta = TECH_CATEGORY_META[category];
            const Icon = getCategoryIcon(category);
            const count = categoryCounts.get(category) ?? 0;
            const active = selectedCategory === category;

            return (
              <button
                key={category}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedCategory(category)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? meta.badgeClassName
                    : "border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <Icon className="mr-1 inline h-3 w-3" />
                {meta.shortLabel}
                <span className="ml-1 font-mono tabular-nums opacity-75">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="tabular-nums" role="status" aria-live="polite">
            แสดง{" "}
            <strong className="font-medium text-foreground">
              {filteredCompetitions.length}
            </strong>{" "}
            จาก {statusScoped.length} รายการ
          </span>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              <RotateCcw className="h-3 w-3" />
              ล้างตัวกรอง
            </button>
          ) : null}
        </div>
      </section>

      {/* Competition List */}
      {filteredCompetitions.length === 0 ? (
        <div className="border-b border-border py-14 text-center">
          <p className="text-sm font-medium text-foreground">
            ไม่พบรายการแข่งขันในเงื่อนไขที่เลือก
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasActiveFilters
              ? "ลองล้างตัวกรองหรือเปลี่ยนหมวดสาย Tech เพื่อดูรายการแข่งขันในไทยทั้งหมด"
              : "ยังไม่มีรายการแข่งขันในสถานะนี้ คุณสามารถเพิ่มรายการด้วย AI ได้ทันที"}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={resetFilters}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                ล้างตัวกรองทั้งหมด
              </Button>
            ) : null}
            {userRole ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSmartModalOpen(true)}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                เพิ่มรายการแข่งขัน
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {filteredCompetitions.map((comp) => {
            const catMeta = TECH_CATEGORY_META[comp.category];
  const Icon = getCategoryIcon(comp.category);
  const countdown = getDeadlineCountdown(comp.deadline, todayIso);
            const visibleRoles = comp.recommended_roles.slice(0, 4);
            const extraRoleCount =
              comp.recommended_roles.length - visibleRoles.length;
            const visibleTech = comp.tech_stack_hints.slice(0, 4);
            const matchInfo = skillMatchById.get(comp.id);
            const matchedCount = matchInfo?.matchedCount ?? 0;

            return (
              <article
                key={comp.id}
                className="group -mx-3 rounded-xl px-3 py-5 transition-colors hover:bg-muted/40 hover:shadow-sm sm:-mx-4 sm:px-4 sm:rounded-lg"
              >
                <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
                  <div className="space-y-2 lg:col-span-8">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium ${catMeta.badgeClassName}`}>
                        <Icon className="h-3 w-3" />
                        {catMeta.shortLabel}
                      </span>
                      {comp.eligibility ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="line-clamp-1">
                            {comp.eligibility}
                          </span>
                        </>
                      ) : null}
                      {matchedCount > 0 ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium tabular-nums text-primary">
                            ตรงทักษะ {matchedCount} รายการ
                          </span>
                        </>
                      ) : null}
                      {comp.my_preferred_role ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 font-medium text-primary">
                            <Check className="h-3 w-3" />
                            ลงชื่อแล้ว ({comp.my_preferred_role})
                          </span>
                        </>
                      ) : null}
                    </div>

                    <h3 className="text-base font-semibold leading-snug tracking-tight text-foreground">
                      <Link
                        href={`/competitions/${comp.id}`}
                        className="transition-colors hover:text-primary"
                      >
                        {comp.title}
                      </Link>
                    </h3>

                    {comp.summary ? (
                      <p className="line-clamp-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                        {comp.summary}
                      </p>
                    ) : null}

                    {visibleRoles.length > 0 || visibleTech.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {visibleRoles.map((role) => (
                          <span
                            key={role}
                            className="rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground/80"
                          >
                            {role}
                          </span>
                        ))}
                        {extraRoleCount > 0 ? (
                          <span className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                            +{extraRoleCount}
                          </span>
                        ) : null}
                        {visibleTech.map((tech) => {
                          const isMatchedHint =
                            matchInfo?.matchedHints.has(tech) ?? false;
                          return (
                            <button
                              key={tech}
                              type="button"
                              onClick={() => setSearchQuery(tech)}
                              title={`กรองรายการที่ใช้ ${tech}`}
                              className={`rounded px-1.5 py-0.5 font-mono text-[11px] transition-colors ${
                                isMatchedHint
                                  ? "border border-primary/30 bg-primary/8 text-primary hover:bg-primary/12"
                                  : "bg-muted text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {tech}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col justify-between gap-3 lg:col-span-4 lg:items-end lg:text-right">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <span className="text-sm font-medium tabular-nums text-foreground">
                          {formatThaiDate(comp.deadline, "short")}
                        </span>
                        {countdown.kind !== "none" ? (
                          <span
                            className={`font-mono text-xs tabular-nums ${
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
                      </div>

                      <p className="text-xs tabular-nums text-muted-foreground">
                        ทีม{" "}
                        {comp.min_size === comp.max_size
                          ? `${comp.min_size} คน`
                          : `${comp.min_size}–${comp.max_size} คน`}{" "}
                        · สนใจ {comp.interest_count} คน
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-0.5 lg:justify-end">
                      {comp.source_url ? (
                        <a
                          href={comp.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`เปิดประกาศต้นทางของ ${comp.title}`}
                          className="inline-flex items-center gap-1 px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                          ต้นทาง
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                      {userRole === "teacher" ? (
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="h-7 rounded-md px-2.5 text-xs"
                        >
                          <Link href={`/teacher/competitions/${comp.id}/teams`}>
                            จัดทีม
                          </Link>
                        </Button>
                      ) : null}
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 rounded-md px-2.5 text-xs font-medium hover:border-primary/40 hover:text-primary"
                      >
                        <Link href={`/competitions/${comp.id}`}>
                          รายละเอียด
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
