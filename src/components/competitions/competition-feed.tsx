"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, LayoutGrid, List, RotateCcw, X } from "lucide-react";
import { AiDiscoveryPanel } from "@/components/competitions/ai-discovery-panel";
import {
  CompetitionCard,
  type CompetitionMatchInfo,
  type FeedCompetitionItem,
} from "@/components/competitions/competition-card";
import {
  FeedFilters,
  type FeedFilterState,
} from "@/components/competitions/feed-filters";
import { Button } from "@/components/ui/button";
import {
  TECH_CATEGORIES,
  type TechCategory,
  type UserRole,
} from "@/lib/constants/tech-taxonomy";
import { explainSkillMatch } from "@/lib/utils/skill-match";
import { getDeadlineCountdown } from "@/lib/utils/thai-date";

export type { FeedCompetitionItem } from "@/components/competitions/competition-card";
export type {
  SortOption,
  TargetLevelFilter,
  TeamSizeFilter,
} from "@/components/competitions/feed-filters";

export type InitialFeedFilters = Partial<FeedFilterState>;

interface CompetitionFeedProps {
  competitions: FeedCompetitionItem[];
  userRole: UserRole | null;
  userSkills?: string[];
  initialFilters?: InitialFeedFilters;
  todayIso: string;
}

type ViewMode = "grid" | "list";

function computeMatchedTech(
  comp: FeedCompetitionItem,
  userSkills: string[],
): CompetitionMatchInfo {
  const explanation = explainSkillMatch({
    userSkills,
    competition: {
      title: comp.title,
      summary: comp.summary,
      recommended_roles: comp.recommended_roles,
      tech_stack_hints: comp.tech_stack_hints,
    },
  });
  const matchedHints = new Set<string>();
  for (const skill of explanation.matchedSkills) {
    for (const evidence of skill.evidence) {
      if (evidence.field === "tech_stack_hint") matchedHints.add(evidence.value);
    }
  }
  return { matchedHints, matchedCount: explanation.matchedSkills.length };
}

function matchesTargetLevel(
  comp: FeedCompetitionItem,
  level: FeedFilterState["level"],
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
  const searchRef = useRef<HTMLInputElement>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [filters, setFilters] = useState<FeedFilterState>(() => {
    const initialSort = initialFilters?.sort ?? "deadline_asc";
    return {
      status: initialFilters?.status ?? "open",
      category: initialFilters?.category ?? "all",
      level: initialFilters?.level ?? "all",
      size: initialFilters?.size ?? "all",
      sort: initialSort === "match" && !hasUserSkills ? "deadline_asc" : initialSort,
      q: initialFilters?.q ?? "",
      match: hasUserSkills ? (initialFilters?.match ?? false) : false,
    };
  });

  const {
    status: statusTab,
    category: selectedCategory,
    level: levelFilter,
    size: teamSizeFilter,
    sort: sortBy,
    q: searchQuery,
    match: onlySkillMatch,
  } = filters;

  function updateFilters(patch: Partial<FeedFilterState>) {
    setFilters((previous) => {
      const next = { ...previous, ...patch };
      if (!hasUserSkills && next.match) next.match = false;
      if (next.sort === "match" && !hasUserSkills) next.sort = "deadline_asc";
      return next;
    });
    if (patch.status !== undefined && patch.status !== statusTab) {
      setUrgentOnly(false);
    }
  }

  // Global "/" shortcut to focus the visible search input.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key !== "/" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
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
      if (searchRef.current?.getClientRects().length) {
        event.preventDefault();
        searchRef.current.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Sync non-default filters cleanly to URL query string.
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
    () => competitions.filter((comp) => comp.status === "open"),
    [competitions],
  );
  const closedCount = useMemo(
    () => competitions.filter((comp) => comp.status === "closed").length,
    [competitions],
  );

  const urgentOpenIds = useMemo(() => {
    const ids = new Set<string>();
    for (const comp of openItems) {
      const countdown = getDeadlineCountdown(comp.deadline, todayIso);
      if (
        countdown.kind === "today" ||
        (countdown.daysRemaining !== null &&
          countdown.daysRemaining >= 0 &&
          countdown.daysRemaining <= 14)
      ) {
        ids.add(comp.id);
      }
    }
    return ids;
  }, [openItems, todayIso]);

  const competitionYear = Number(todayIso.slice(0, 4)) + 543;

  const statusScoped = useMemo(
    () =>
      competitions.filter((comp) => {
        if (comp.status !== statusTab) return false;
        return (
          statusTab !== "open" ||
          getDeadlineCountdown(comp.deadline, todayIso).kind !== "expired"
        );
      }),
    [competitions, statusTab, todayIso],
  );

  const categoryCounts = useMemo(() => {
    const map = new Map<TechCategory, number>();
    for (const category of TECH_CATEGORIES) {
      map.set(category, 0);
    }
    for (const comp of statusScoped) {
      map.set(comp.category, (map.get(comp.category) ?? 0) + 1);
    }
    return map;
  }, [statusScoped]);

  const skillMatchById = useMemo(() => {
    const map = new Map<string, CompetitionMatchInfo>();
    if (!hasUserSkills) return map;
    for (const comp of competitions) {
      map.set(comp.id, computeMatchedTech(comp, userSkills));
    }
    return map;
  }, [competitions, userSkills, hasUserSkills]);

  const filteredCompetitions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const matched = statusScoped.filter((comp) => {
      if (urgentOnly && !urgentOpenIds.has(comp.id)) {
        return false;
      }

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

      if (query.length > 0) {
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
        if (!haystack.includes(query)) {
          return false;
        }
      }

      return true;
    });

    return [...matched].sort((a, b) => {
      if (sortBy === "match" && hasUserSkills) {
        const matchA = skillMatchById.get(a.id)?.matchedCount ?? 0;
        const matchB = skillMatchById.get(b.id)?.matchedCount ?? 0;
        if (matchB !== matchA) return matchB - matchA;
      } else if (sortBy === "popular") {
        if (b.interest_count !== a.interest_count) {
          return b.interest_count - a.interest_count;
        }
      } else if (sortBy === "newest") {
        return b.created_at.localeCompare(a.created_at);
      }

      const deadlineA = a.deadline ?? "9999-12-31";
      const deadlineB = b.deadline ?? "9999-12-31";
      if (deadlineA !== deadlineB) return deadlineA.localeCompare(deadlineB);
      return b.created_at.localeCompare(a.created_at);
    });
  }, [
    statusScoped,
    urgentOnly,
    urgentOpenIds,
    selectedCategory,
    levelFilter,
    teamSizeFilter,
    searchQuery,
    sortBy,
    hasUserSkills,
    onlySkillMatch,
    skillMatchById,
  ]);

  const activeFilterCount =
    (selectedCategory !== "all" ? 1 : 0) +
    (levelFilter !== "all" ? 1 : 0) +
    (teamSizeFilter !== "all" ? 1 : 0) +
    (hasUserSkills && onlySkillMatch ? 1 : 0) +
    (searchQuery.trim().length > 0 ? 1 : 0) +
    (urgentOnly ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;

  function resetFilters() {
    setUrgentOnly(false);
    updateFilters({
      category: "all",
      level: "all",
      size: "all",
      match: false,
      q: "",
    });
  }

  const filterPanelProps = {
    filters,
    onFiltersChange: updateFilters,
    openCount: openItems.length,
    closedCount,
    categoryCounts,
    statusScopedCount: statusScoped.length,
    competitionYear,
    hasUserSkills,
    hasActiveFilters,
    onReset: resetFilters,
  };

  return (
    <div className="min-w-0">
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
          <div className="min-w-0 space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-widest text-primary">
              ฐานข้อมูลการแข่งขันในประเทศไทย
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              การแข่งขันคอมพิวเตอร์และเทคโนโลยี
            </h1>
            <p className="max-w-xl truncate text-sm leading-relaxed text-muted-foreground">
              เวทีแข่งเทคโนโลยีในไทยที่เปิดรับสมัครอยู่ตอนนี้
            </p>
          </div>

          <div className="flex min-w-0 flex-col items-start gap-3 lg:items-end">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-lg font-bold tabular-nums text-primary">
                  {openItems.length}
                </span>
                <span className="text-xs text-muted-foreground">เปิดรับสมัคร</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-lg font-bold tabular-nums text-peach-foreground">
                  {urgentOpenIds.size}
                </span>
                <span className="text-xs text-muted-foreground">ปิดใน 14 วัน</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-lg font-bold tabular-nums text-muted-foreground">
                  {closedCount}
                </span>
                <span className="text-xs text-muted-foreground">
                  คลังปี {competitionYear}
                </span>
              </div>
              {userRole ? null : (
                <Button
                  asChild
                  size="sm"
                  className="gap-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Link href="/login">
                    เข้าสู่ระบบเพื่อลงชื่อแข่ง
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}
            </div>

            <div className="w-full lg:w-[26rem]">
              <AiDiscoveryPanel userSkills={userSkills} />
            </div>
          </div>
        </div>
      </section>

      <section
        aria-label="แถบตัวกรองการแข่งขัน"
        className="mt-5 border-y border-border/60 py-3"
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            ตัวกรอง
          </span>
          <button
            type="button"
            aria-pressed={urgentOnly}
            onClick={() => setUrgentOnly((previous) => !previous)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              urgentOnly
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            ปิดใน 14 วัน{" "}
            <span className="font-mono tabular-nums">({urgentOpenIds.size})</span>
          </button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <div className="min-w-0 flex-1">
            <FeedFilters {...filterPanelProps} searchInputRef={searchRef} />
          </div>

          <div className="shrink-0 pt-0.5">
            <div
              role="group"
              aria-label="รูปแบบการแสดงผล"
              className="inline-flex items-center gap-1 rounded-xl border border-border/60 bg-muted/40 p-1"
            >
              <button
                type="button"
                aria-label="แสดงเป็นตาราง"
                aria-pressed={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                  viewMode === "grid"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="แสดงเป็นรายการ"
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                  viewMode === "list"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p
          className="text-xs leading-relaxed text-muted-foreground tabular-nums"
          role="status"
          aria-live="polite"
        >
          แสดง{" "}
          <strong className="font-medium text-foreground">
            {filteredCompetitions.length}
          </strong>{" "}
          จาก {statusScoped.length} รายการ
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {urgentOnly ? (
            <button
              type="button"
              onClick={() => setUrgentOnly(false)}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
            >
              ปิดใน 14 วัน
              <X className="h-3 w-3" />
              <span className="sr-only">ล้างตัวกรองปิดใน 14 วัน</span>
            </button>
          ) : null}
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <RotateCcw className="h-3 w-3" />
              ล้างตัวกรอง
            </button>
          ) : null}
        </div>
      </div>

      <section className="mt-3">
        {filteredCompetitions.length === 0 ? (
          <div className="border-b border-border py-14 text-center">
            <p className="text-sm font-medium text-foreground leading-[1.35]">
              ไม่พบรายการแข่งขันในเงื่อนไขที่เลือก
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {hasActiveFilters
                ? "ลองล้างตัวกรองหรือเปลี่ยนหมวดสาย Tech เพื่อดูรายการแข่งขันในไทยทั้งหมด"
                : "ยังไม่มีรายการแข่งขันในสถานะนี้"}
            </p>
            {hasActiveFilters ? (
              <div className="mt-5 flex justify-center">
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  ล้างตัวกรองทั้งหมด
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5"
                : "grid grid-cols-1 gap-5"
            }
          >
            {filteredCompetitions.map((comp) => (
              <CompetitionCard
                key={comp.id}
                competition={comp}
                todayIso={todayIso}
                userRole={userRole}
                matchInfo={skillMatchById.get(comp.id)}
                onTechChipClick={(tech) => updateFilters({ q: tech })}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
