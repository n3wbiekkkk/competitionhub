"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  ClipboardCheck,
  CornerDownLeft,
  Home,
  Loader2,
  LogIn,
  Moon,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Trophy,
  UserCircle2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { useTheme } from "@/components/theme/theme-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  TECH_CATEGORY_META,
  techCategorySchema,
} from "@/lib/constants/tech-taxonomy";
import { formatThaiDate } from "@/lib/utils/thai-date";
import { useCommandPalette } from "./command-context";

const competitionsResponseSchema = z.object({
  competitions: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string().min(1),
      category: techCategorySchema,
      deadline: z.string().nullable(),
    }),
  ),
});

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  keywords?: string;
  icon: LucideIcon;
  onSelect: () => void;
}

interface CommandGroup {
  id: string;
  label: string;
  items: CommandItem[];
}

function matchesQuery(query: string, item: CommandItem): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = `${item.label} ${item.hint ?? ""} ${item.keywords ?? ""}`.toLowerCase();
  return needle.split(/\s+/).every((part) => haystack.includes(part));
}

export function CommandPalette() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const {
    open,
    setOpen,
    query,
    setQuery,
    openSmartAdd,
    openNotifications,
    user,
  } = useCommandPalette();

  const [competitions, setCompetitions] = useState<
    z.infer<typeof competitionsResponseSchema>["competitions"]
  >([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const trimmedQuery = query.trim();
  const shouldSearch = open && trimmedQuery.length >= 2;
  const visibleCompetitions = useMemo(
    () => (shouldSearch ? competitions : []),
    [shouldSearch, competitions],
  );
  const isSearching = shouldSearch && searching;

  useEffect(() => {
    if (!shouldSearch) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      const params = new URLSearchParams({ q: trimmedQuery, status: "open" });
      void (async () => {
        try {
          const response = await fetch(`/api/competitions?${params.toString()}`, {
            signal: controller.signal,
            cache: "no-store",
          });
          if (!response.ok) {
            setCompetitions([]);
            return;
          }
          const parsed = competitionsResponseSchema.safeParse(
            await response.json(),
          );
          setCompetitions(parsed.success ? parsed.data.competitions.slice(0, 6) : []);
        } catch {
          if (!controller.signal.aborted) setCompetitions([]);
        } finally {
          if (!controller.signal.aborted) setSearching(false);
        }
      })();
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [shouldSearch, trimmedQuery]);

  const groups = useMemo<CommandGroup[]>(() => {
    const go = (href: string) => () => router.push(href);
    const navigation: CommandItem[] = [
      {
        id: "competitions",
        label: "รายการแข่งขัน",
        hint: "หน้าแรก",
        keywords: "home competition แข่ง ข่าว",
        icon: Trophy,
        onSelect: go("/"),
      },
    ];

    if (user) {
      navigation.push(
        {
          id: "people",
          label: "ค้นหาคนทำทีม",
          hint: "ค้นหาโปรไฟล์ที่เปิดให้ค้นพบ",
          keywords: "people directory team คน เพื่อน",
          icon: Users,
          onSelect: go(
            trimmedQuery
              ? `/people?q=${encodeURIComponent(trimmedQuery)}`
              : "/people",
          ),
        },
        {
          id: "teams",
          label: "ทีมของฉัน",
          hint: "รายการที่สนใจและทีมที่ยืนยันแล้ว",
          keywords: "my teams ทีม",
          icon: Users,
          onSelect: go("/my-teams"),
        },
        {
          id: "profile",
          label: "โปรไฟล์",
          hint: "ข้อมูลและทักษะของฉัน",
          keywords: "profile account ผู้ใช้",
          icon: UserCircle2,
          onSelect: go("/profile"),
        },
      );
    } else {
      navigation.push({
        id: "login",
        label: "เข้าสู่ระบบ",
        hint: "เข้าสู่บัญชีเพื่อจัดทีม",
        keywords: "login signin เข้าสู่ระบบ",
        icon: LogIn,
        onSelect: go("/login"),
      });
    }

    const tools: CommandItem[] = [
      {
        id: "theme-toggle",
        label: resolvedTheme === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด",
        hint: "theme",
        keywords: "theme dark light สี ธีม",
        icon: resolvedTheme === "dark" ? Sun : Moon,
        onSelect: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
      },
      {
        id: "theme-system",
        label: "ใช้ธีมตามระบบ",
        hint: "theme",
        keywords: "theme system อัตโนมัติ",
        icon: Settings,
        onSelect: () => setTheme("system"),
      },
    ];

    if (user) {
      tools.unshift(
        {
          id: "smart-add",
          label: "เพิ่มรายการด้วย AI",
          hint: "วางลิงก์ ข้อความ หรือโปสเตอร์",
          keywords: "smart add ai import เพิ่ม รายการ",
          icon: Plus,
          onSelect: openSmartAdd,
        },
        {
          id: "notifications",
          label: "การแจ้งเตือน",
          hint: "เปิดรายการแจ้งเตือนของฉัน",
          keywords: "notification bell แจ้งเตือน",
          icon: Bell,
          onSelect: openNotifications,
        },
      );
      tools.push({
        id: "settings",
        label: "ตั้งค่า",
        hint: "บัญชี เซสชัน และธีม",
        keywords: "settings preference ตั้งค่า",
        icon: Settings,
        onSelect: go("/settings"),
      });
    }

    const result: CommandGroup[] = [
      { id: "navigation", label: "หน้าเว็บ · navigate", items: navigation },
    ];

    if (trimmedQuery.length > 0 && user) {
      result.push({
        id: "people-search",
        label: "ค้นหา · ผู้คน",
        items: [
          {
            id: "people-query",
            label: `ค้นหาคนว่า “${trimmedQuery}”`,
            hint: "เปิดหน้าผู้คนพร้อมคำค้นหา",
            icon: Users,
            onSelect: go(`/people?q=${encodeURIComponent(trimmedQuery)}`),
          },
        ],
      });
    }

    if (visibleCompetitions.length > 0) {
      result.push({
        id: "competitions-search",
        label: "การแข่งขัน",
        items: visibleCompetitions.map((competition) => ({
          id: `competition-${competition.id}`,
          label: competition.title,
          hint: `${TECH_CATEGORY_META[competition.category].labelTh} · ${formatThaiDate(competition.deadline)}`,
          keywords: competition.category,
          icon: Trophy,
          onSelect: go(`/competitions/${competition.id}`),
        })),
      });
    }

    result.push({ id: "tools", label: "เครื่องมือ · การตั้งค่า", items: tools });

    if (user?.role === "teacher") {
      result.push({
        id: "teacher-admin",
        label: "เครื่องมืออาจารย์และผู้ดูแลระบบ",
        items: [
          {
            id: "review",
            label: "คิวตรวจรายการ",
            hint: "ตรวจและสแกนรายการแข่งขันใหม่",
            keywords: "teacher review scout ตรวจ สแกน",
            icon: ClipboardCheck,
            onSelect: go("/teacher/review"),
          },
          {
            id: "admin",
            label: "ผู้ดูแลระบบ",
            hint: "จัดการผู้ใช้ ห้องเรียน และภาพรวม",
            keywords: "admin users classroom ผู้ดูแล",
            icon: ShieldCheck,
            onSelect: go("/admin"),
          },
        ],
      });
    }

    return result
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => matchesQuery(trimmedQuery, item)),
      }))
      .filter((group) => group.items.length > 0);
  }, [
    visibleCompetitions,
    openNotifications,
    openSmartAdd,
    resolvedTheme,
    router,
    setTheme,
    trimmedQuery,
    user,
  ]);

  const indexedGroups = useMemo(() => {
    let index = 0;
    return groups.map((group) => ({
      ...group,
      items: group.items.map((item) => ({ item, index: index++ })),
    }));
  }, [groups]);

  const flatItems = useMemo(
    () => indexedGroups.flatMap((group) => group.items.map((entry) => entry.item)),
    [indexedGroups],
  );

  const selectedIndex = Math.min(activeIndex, Math.max(flatItems.length - 1, 0));

  useEffect(() => {
    optionRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  function selectItem(item: CommandItem) {
    setOpen(false);
    item.onSelect();
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (flatItems.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % flatItems.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (current) => (current - 1 + flatItems.length) % flatItems.length,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const selected = flatItems[selectedIndex] ?? flatItems[0];
      if (selected) selectItem(selected);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[10%] max-w-2xl translate-y-0 gap-0 overflow-hidden p-0 sm:top-[12%]">
        <DialogTitle className="sr-only">คำสั่งด่วน</DialogTitle>
        <DialogDescription className="sr-only">
          ค้นหารายการแข่งขัน ทีม ผู้คน หรือเครื่องมือของ TechComp Hub
        </DialogDescription>

        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="ค้นหารายการแข่งขัน คน หรือคำสั่ง…"
            aria-label="ค้นหาคำสั่ง"
            className="h-10 border-0 px-0 text-base shadow-none focus-visible:ring-0"
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            ESC
          </kbd>
        </div>

        <div className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
          {isSearching ? (
            <p className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              กำลังค้นหาการแข่งขัน…
            </p>
          ) : null}

          {indexedGroups.map((group) => (
            <section key={group.id} className="mb-2 last:mb-0">
              <h3 className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                {group.label}
              </h3>
              <div role="listbox" aria-label={group.label}>
                {group.items.map(({ item, index }) => {
                  const Icon = item.icon;
                  const active = index === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      ref={(node) => {
                        optionRefs.current[index] = node;
                      }}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectItem(item)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                        active ? "bg-muted text-foreground" : "text-foreground/90"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.label}</span>
                        {item.hint ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {item.hint}
                          </span>
                        ) : null}
                      </span>
                      {active ? (
                        <CornerDownLeft
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          {!isSearching && flatItems.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <Home className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">ไม่พบคำสั่งที่ตรงกัน</p>
              <p className="text-xs text-muted-foreground">
                ลองคำอื่น หรือเปิดหน้ารายการแข่งขันเพื่อดูรายการทั้งหมด
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-4 border-t border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          <span><kbd className="font-mono">↑↓</kbd> เลือก</span>
          <span><kbd className="font-mono">↵</kbd> เปิด</span>
          <span className="ml-auto hidden sm:inline">TechComp Hub · คำสั่งด่วน</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
