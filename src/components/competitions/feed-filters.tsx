"use client";

import { createElement, type RefObject } from "react";
import { RotateCcw, Search, X } from "lucide-react";
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
} from "@/lib/constants/tech-taxonomy";

export type TeamSizeFilter = "all" | "solo" | "small" | "large";
export type TargetLevelFilter = "all" | "high_school" | "university" | "public";
export type SortOption = "deadline_asc" | "popular" | "newest" | "match";

export interface FeedFilterState {
  status: "open" | "closed";
  category: "all" | TechCategory;
  level: TargetLevelFilter;
  size: TeamSizeFilter;
  sort: SortOption;
  q: string;
  match: boolean;
}

interface FeedFiltersProps {
  filters: FeedFilterState;
  onFiltersChange: (patch: Partial<FeedFilterState>) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  openCount: number;
  closedCount: number;
  categoryCounts: Map<TechCategory, number>;
  statusScopedCount: number;
  competitionYear: number;
  hasUserSkills: boolean;
  hasActiveFilters: boolean;
  onReset: () => void;
}

const LEVEL_OPTIONS = [
  { id: "all", label: "ทุกระดับ" },
  { id: "high_school", label: "ม.ปลาย" },
  { id: "university", label: "มหาวิทยาลัย" },
  { id: "public", label: "บุคคลทั่วไป" },
] as const;

function isTeamSizeFilter(value: string): value is TeamSizeFilter {
  return value === "all" || value === "solo" || value === "small" || value === "large";
}

function isSortOption(value: string): value is SortOption {
  return (
    value === "deadline_asc" ||
    value === "popular" ||
    value === "newest" ||
    value === "match"
  );
}

function toggleClassName(active: boolean, accent = false): string {
  if (active) {
    return accent
      ? "border-primary/30 bg-primary/10 text-primary"
      : "border-foreground bg-foreground text-background";
  }
  return "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground";
}

export function FeedFilters({
  filters,
  onFiltersChange,
  searchInputRef,
  openCount,
  closedCount,
  categoryCounts,
  statusScopedCount,
  competitionYear,
  hasUserSkills,
  hasActiveFilters,
  onReset,
}: FeedFiltersProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Tabs
          value={filters.status}
          onValueChange={(value) =>
            onFiltersChange({ status: value === "closed" ? "closed" : "open" })
          }
          className="flex-none"
        >
          <TabsList
            variant="line"
            className="h-auto w-auto gap-5 rounded-none bg-transparent p-0 group-data-horizontal/tabs:h-auto"
          >
            <TabsTrigger
              value="open"
              className="flex-none gap-1.5 whitespace-nowrap rounded-none px-0 pb-2 text-sm font-medium after:bg-primary group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold"
            >
              <span>กำลังเปิดรับสมัคร</span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {openCount}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="closed"
              aria-label={`ปิดรับแล้ว (คลังปี ${competitionYear})`}
              className="flex-none gap-1.5 whitespace-nowrap rounded-none px-0 pb-2 text-sm font-medium after:bg-primary group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold"
            >
              <span>คลังปี {competitionYear}</span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {closedCount}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="search"
            size={20}
            aria-label="ค้นหารายการแข่งขัน"
            placeholder="ค้นหาการแข่งขัน"
            value={filters.q}
            onChange={(event) => onFiltersChange({ q: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                if (filters.q.length > 0) {
                  onFiltersChange({ q: "" });
                } else {
                  event.currentTarget.blur();
                }
              }
            }}
            className="h-9 w-auto rounded-lg pl-9 pr-9 text-sm"
          />
          {filters.q.length > 0 ? (
            <button
              type="button"
              onClick={() => onFiltersChange({ q: "" })}
              aria-label="ล้างคำค้นหา"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
              /
            </kbd>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={filters.size}
            onValueChange={(value) => {
              if (isTeamSizeFilter(value)) onFiltersChange({ size: value });
            }}
          >
            <SelectTrigger aria-label="กรองตามขนาดทีม" className="h-9 rounded-lg">
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
            value={filters.sort}
            onValueChange={(value) => {
              if (isSortOption(value)) onFiltersChange({ sort: value });
            }}
          >
            <SelectTrigger aria-label="เรียงลำดับรายการ" className="h-9 rounded-lg">
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

        <div className="flex items-center gap-1.5">
          {LEVEL_OPTIONS.map((level) => {
            const active = filters.level === level.id;
            return (
              <button
                key={level.id}
                type="button"
                aria-pressed={active}
                onClick={() => onFiltersChange({ level: level.id })}
                className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${toggleClassName(active)}`}
              >
                {level.label}
              </button>
            );
          })}
          {hasUserSkills ? (
            <button
              type="button"
              aria-pressed={filters.match}
              onClick={() => onFiltersChange({ match: !filters.match })}
              className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${toggleClassName(filters.match, true)}`}
            >
              ตรงทักษะฉัน
            </button>
          ) : null}
        </div>

        {hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="shrink-0 gap-1.5 text-primary hover:text-primary"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            ล้างตัวกรอง
          </Button>
        ) : null}
      </div>

      <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          aria-pressed={filters.category === "all"}
          onClick={() => onFiltersChange({ category: "all" })}
          className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors ${toggleClassName(filters.category === "all")}`}
        >
          ทั้งหมด{" "}
          <span className="ml-0.5 font-mono tabular-nums opacity-75">
            {statusScopedCount}
          </span>
        </button>

        {TECH_CATEGORIES.map((category) => {
          const meta = TECH_CATEGORY_META[category];
          const count = categoryCounts.get(category) ?? 0;
          const active = filters.category === category;

          return (
            <button
              key={category}
              type="button"
              aria-pressed={active}
              onClick={() => onFiltersChange({ category })}
              className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                active ? meta.badgeClassName : toggleClassName(false)
              } ${count === 0 && !active ? "opacity-50" : ""}`}
            >
              {createElement(getCategoryIcon(category), {
                className: "mr-1 h-3 w-3",
              })}
              {meta.shortLabel}
              <span className="ml-1 font-mono tabular-nums opacity-75">
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
