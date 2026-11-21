"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  LayoutGrid,
  List,
  Plus,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
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
import { SmartAddModal } from "@/components/competitions/smart-add-modal";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  TECH_CATEGORIES,
  TECH_CATEGORY_META,
  type TechCategory,
  type UserRole,
} from "@/lib/constants/tech-taxonomy";
import { explainSkillMatch } from "@/lib/utils/skill-match";
import {
  formatThaiDate,
  getDeadlineCountdown,
} from "@/lib/utils/thai-date";

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
  const railSearchRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const pendingSearchFocusRef = useRef(false);

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [smartModalOpen, setSmartModalOpen] = useState(false);
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
  }

  // Global "/" shortcut to focus the visible search input, opening filters on mobile.
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
      event.preventDefault();
      const visibleSearch = [railSearchRef.current, mobileSearchRef.current].find(
        (input) => input !== null && input.getClientRects().length > 0,
      );
      if (visibleSearch) {
        visibleSearch.focus();
        return;
      }
      pendingSearchFocusRef.current = true;
      setMobileFiltersOpen(true);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!mobileFiltersOpen || !pendingSearchFocusRef.current) return;
    const frame = requestAnimationFrame(() => {
      mobileSearchRef.current?.focus();
      pendingSearchFocusRef.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [mobileFiltersOpen]);

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
    (searchQuery.trim().length > 0 ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;

  function resetFilters() {
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
    <div className="xl:flex xl:items-start xl:gap-8">
      <aside className="hidden w-72 shrink-0 xl:sticky xl:top-24 xl:block xl:self-start">
        <div className="surface-subtle rounded-2xl p-5">
          <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            ตัวกรอง
          </p>
          <FeedFilters {...filterPanelProps} searchInputRef={railSearchRef} />
        </div>
      </aside>

      <div className="min-w-0 flex-1 space-y-8">
        <section className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-widest text-primary">
              ฐานข้อมูลการแข่งขันในประเทศไทย
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              การแข่งขันคอมพิวเตอร์และเทคโนโลยี
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              คัดเฉพาะเวทีในไทยด้านซอฟต์แวร์ AI ความปลอดภัยไซเบอร์ หุ่นยนต์
              และนวัตกรรมดิจิทัล พร้อมลงชื่อตามบทบาทเพื่อจัดทีม
            </p>
          </div>
          <AiDiscoveryPanel userSkills={userSkills} />
        </section>

        <div className="flex flex-wrap items-center gap-4 border-y border-border py-3 sm:gap-6">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xl font-bold tabular-nums text-primary">
              {openItems.length}
            </span>
            <span className="text-xs text-muted-foreground">เปิดรับสมัคร</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xl font-bold tabular-nums text-peach-foreground">
              {urgentSpotlight.length}
            </span>
            <span className="text-xs text-muted-foreground">ปิดใน 14 วัน</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xl font-bold tabular-nums text-muted-foreground">
              {closedCount}
            </span>
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
            <Button
              asChild
              size="sm"
              className="ml-auto gap-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Link href="/login">
                เข้าสู่ระบบเพื่อลงชื่อแข่ง
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
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

        <div className="xl:hidden">
          <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                className="h-10 w-full gap-2 rounded-xl text-sm"
              >
                <SlidersHorizontal className="h-4 w-4" />
                ตัวกรองการแข่งขัน
                {activeFilterCount > 0 ? (
                  <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 font-mono text-[11px] tabular-nums text-primary-foreground">
                    {activeFilterCount}
                  </span>
                ) : null}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="flex w-[min(88vw,22rem)] flex-col gap-0 overflow-y-auto p-0 sm:max-w-sm"
            >
              <SheetHeader className="border-b border-border/60 p-5">
                <SheetTitle>ตัวกรองการแข่งขัน</SheetTitle>
                <SheetDescription className="leading-relaxed">
                  เลือกสายงาน ระดับผู้เข้าร่วม และขนาดทีมเพื่อค้นหาเวทีที่ใช่
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-5">
                <FeedFilters
                  {...filterPanelProps}
                  searchInputRef={mobileSearchRef}
                />
              </div>
              <SheetFooter className="border-t border-border/60 p-4">
                <SheetClose asChild>
                  <Button className="w-full rounded-xl">
                    ดูรายการที่ตรงเงื่อนไข
                  </Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>

        {statusTab === "open" && !hasActiveFilters && urgentSpotlight.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground">
              ปิดรับสมัครภายใน 14 วัน
            </h2>
            <div className="grid divide-y divide-border border-y border-border md:grid-cols-3 md:divide-x md:divide-y-0">
              {urgentSpotlight.map(({ comp, countdown }) => {
                const categoryMeta = TECH_CATEGORY_META[comp.category];
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
                        {categoryMeta.shortLabel}
                      </p>
                      <p className="line-clamp-2 text-sm font-medium leading-[1.35] text-foreground transition-colors group-hover:text-primary">
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

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
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

          {filteredCompetitions.length === 0 ? (
            <div className="border-b border-border py-14 text-center">
              <p className="text-sm font-medium text-foreground leading-[1.35]">
                ไม่พบรายการแข่งขันในเงื่อนไขที่เลือก
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
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
            <div
              className={
                viewMode === "grid"
                  ? "grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6"
                  : "grid grid-cols-1 gap-6"
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
    </div>
  );
}
