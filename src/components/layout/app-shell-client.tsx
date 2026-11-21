"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BookOpenCheck,
  ChartNoAxesCombined,
  ClipboardCheck,
  Code2,
  LayoutGrid,
  LogIn,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserCircle2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useSyncExternalStore, useState } from "react";
import {
  COMMAND_EVENTS,
  useCommandPalette,
} from "@/components/command/command-context";
import { SmartAddModal } from "@/components/competitions/smart-add-modal";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { getInitials } from "@/lib/utils/initials";
import type { NotificationItem, Profile } from "@/types/database";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Footer } from "@/components/layout/footer";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import { ThemedToaster } from "@/components/theme/theme-provider";

interface NavItem {
  href: string;
  label: string;
  detail?: string;
  icon: LucideIcon;
  show: boolean;
  badge?: number;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

interface AppShellClientProps {
  user: Profile | null;
  pendingReviewCount: number;
  children: ReactNode;
}

const SIDEBAR_STORAGE_KEY = "techcomp-sidebar-collapsed";

function NotificationList({
  notifications,
  unreadCount,
  onMarkAllRead,
  onNavigate,
}: {
  notifications: NotificationItem[];
  unreadCount: number;
  onMarkAllRead: () => void;
  onNavigate: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between px-3 py-2">
        <p className="text-sm font-medium">การแจ้งเตือน</p>
        {unreadCount > 0 ? (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="text-xs text-primary hover:underline"
          >
            อ่านทั้งหมด
          </button>
        ) : null}
      </div>
      <div className="max-h-80 overflow-y-auto">
        {notifications.slice(0, 8).map((item) => (
          <Link
            key={item.id}
            href={item.href ?? "/"}
            onClick={onNavigate}
            className="flex min-w-0 flex-col gap-0.5 rounded-md px-3 py-2 text-sm outline-none hover:bg-muted focus-visible:bg-muted"
          >
            <span className="truncate">{item.title}</span>
            {item.body ? (
              <span className="truncate text-xs text-muted-foreground">
                {item.body}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
      {notifications.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          ยังไม่มีการแจ้งเตือน
        </p>
      ) : null}
    </>
  );
}

function SidebarLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
        collapsed ? "lg:justify-center lg:px-0" : ""
      } ${
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {!collapsed ? (
        <span className="min-w-0 flex-1">
          <span className="block truncate">{item.label}</span>
          {item.detail ? (
            <span className="block truncate text-[11px] text-muted-foreground">
              {item.detail}
            </span>
          ) : null}
        </span>
      ) : null}
      {item.badge && item.badge > 0 ? (
        <span className="rounded-full bg-primary/12 px-1.5 font-mono text-[10px] font-semibold tabular-nums text-primary">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

export function AppShellClient({
  user,
  pendingReviewCount,
  children,
}: AppShellClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { openPalette } = useCommandPalette();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapseOverride, setCollapseOverride] = useState<boolean | null>(null);
  const [smartModalOpen, setSmartModalOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileNotificationsOpen, setMobileNotificationsOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const subscribeToSidebar = useCallback((onChange: () => void) => {
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
  }, []);
  const getSidebarSnapshot = useCallback(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }, []);
  const getSidebarServerSnapshot = useCallback(() => false, []);
  const storedCollapsed = useSyncExternalStore(
    subscribeToSidebar,
    getSidebarSnapshot,
    getSidebarServerSnapshot,
  );
  const collapsed = collapseOverride ?? storedCollapsed;

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const response = await fetch("/api/notifications");
        if (!response.ok) return;
        const data = (await response.json()) as {
          notifications: NotificationItem[];
        };
        setNotifications(data.notifications);
      } catch {
        // Bell remains usable after a page refresh.
      }
    })();
  }, [user]);

  function toggleSidebar() {
    const next = !collapsed;
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Collapse still works for this page when storage is unavailable.
    }
    setCollapseOverride(next);
    window.dispatchEvent(new Event("storage"));
  }

  async function markAllRead() {
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!response.ok) throw new Error("mark failed");
      setNotifications((prev) =>
        prev.map((item) => ({
          ...item,
          read_at: new Date().toISOString(),
        })),
      );
    } catch {
      toast.error("ไม่สามารถอัปเดตการแจ้งเตือนได้");
    }
  }

  const unreadCount = notifications.filter((item) => !item.read_at).length;

  useEffect(() => {
    function handleSmartAdd() {
      if (user) setSmartModalOpen(true);
    }
    function handleNotifications() {
      if (!user) return;
      if (window.matchMedia("(max-width: 767px)").matches) {
        setMobileNotificationsOpen(true);
      } else {
        setNotificationsOpen(true);
      }
    }
    function handleMobileMenu() {
      setMobileOpen(true);
    }

    window.addEventListener(COMMAND_EVENTS.smartAdd, handleSmartAdd);
    window.addEventListener(COMMAND_EVENTS.notifications, handleNotifications);
    window.addEventListener(COMMAND_EVENTS.mobileMenu, handleMobileMenu);
    return () => {
      window.removeEventListener(COMMAND_EVENTS.smartAdd, handleSmartAdd);
      window.removeEventListener(
        COMMAND_EVENTS.notifications,
        handleNotifications,
      );
      window.removeEventListener(COMMAND_EVENTS.mobileMenu, handleMobileMenu);
    };
  }, [user]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
      toast.success("ออกจากระบบเรียบร้อยแล้ว");
      router.push("/");
      router.refresh();
    } catch {
      toast.error("ไม่สามารถออกจากระบบได้");
    } finally {
      setLoggingOut(false);
    }
  }

  const navGroups: NavGroup[] = [
    {
      label: "สำรวจ",
      items: [
        {
          href: "/",
          label: "รายการแข่งขัน",
          detail: "ค้นหาเวทีที่ใช่",
          icon: Trophy,
          show: true,
        },
        {
          href: "/people",
          label: "ผู้คน",
          detail: "ค้นหาเพื่อนร่วมทีม",
          icon: Users,
          show: Boolean(user),
        },
        {
          href: "/showcase",
          label: "หอเกียรติยศ",
          detail: "ผลงานและรางวัล",
          icon: BookOpenCheck,
          show: true,
        },
      ],
    },
    {
      label: "พื้นที่ของฉัน",
      items: [
        {
          href: "/my-teams",
          label: "ทีมของฉัน",
          detail: "งานและ teammate",
          icon: LayoutGrid,
          show: Boolean(user),
        },
        {
          href: "/profile",
          label: "โปรไฟล์",
          detail: "ทักษะและผลงาน",
          icon: UserCircle2,
          show: Boolean(user),
        },
        {
          href: "/settings",
          label: "ตั้งค่า",
          detail: "บัญชีและการแจ้งเตือน",
          icon: Settings,
          show: Boolean(user),
        },
      ],
    },
    {
      label: "สตูดิโออาจารย์",
      items: [
        {
          href: "/teacher/review",
          label: "คิวตรวจรายการ",
          detail: "ตรวจและอนุมัติ",
          icon: ClipboardCheck,
          show: user?.role === "teacher",
          badge: pendingReviewCount,
        },
        {
          href: "/teacher",
          label: "จัดทีมและดูแลทีม",
          detail: "วางแผนและจัดทีม",
          icon: Users,
          show: user?.role === "teacher",
        },
        {
          href: "/teacher/reports",
          label: "รายงานสรุป",
          detail: "ผลกระทบต่อโรงเรียน",
          icon: ChartNoAxesCombined,
          show: user?.role === "teacher",
        },
      ],
    },
    {
      label: "ผู้ดูแลระบบ",
      items: [
        {
          href: "/admin",
          label: "ผู้ดูแลระบบ",
          detail: "แผงควบคุมแอดมิน",
          icon: ShieldCheck,
          show: user?.role === "teacher",
        },
      ],
    },
  ].map((group) => ({
    ...group,
    items: group.items.filter((item) => item.show),
  })).filter((group) => group.items.length > 0);

  const flatNavItems = navGroups.flatMap((group) => group.items);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    if (href === "/teacher") return pathname.startsWith("/teacher/competitions");
    return pathname.startsWith(href);
  }

  const currentTitle =
    flatNavItems
      .filter((item) => isActive(item.href))
      .sort((a, b) => b.href.length - a.href.length)[0]?.label ??
    "TechComp Hub";

  const shellStyle = {
    "--sidebar-width": collapsed ? "4.5rem" : "15.5rem",
  } as CSSProperties;

  return (
    <div className="min-h-screen bg-background" style={shellStyle}>
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-[100] -translate-y-24 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition-transform focus:translate-y-0"
      >
        ข้ามไปยังเนื้อหาหลัก
      </a>
      <OfflineBanner />

      <aside
        aria-label="เมนูหลัก"
        className={`fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-width,15.5rem)] flex-col border-r border-border/60 bg-sidebar transition-[width] duration-200 lg:flex ${
          collapsed ? "items-center" : ""
        }`}
      >
        <div
          className={`flex h-16 shrink-0 items-center border-b border-border/60 ${
            collapsed ? "justify-center px-2" : "gap-2.5 px-4"
          }`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
            <Code2 className="h-4 w-4" aria-hidden="true" />
          </span>
          {!collapsed ? (
            <span className="truncate text-sm font-semibold tracking-tight">
              TechComp Hub
            </span>
          ) : null}
        </div>
        <nav
          aria-label="เมนูหลัก"
          className={`flex-1 space-y-6 overflow-y-auto py-5 ${collapsed ? "px-2" : "px-3"}`}
        >
          {navGroups.map((group) => (
            <div key={group.label}>
              {!collapsed ? (
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
                  {group.label}
                </p>
              ) : (
                <div className="mx-auto mb-2 h-px w-6 bg-border/60" />
              )}
              <div className="space-y-1">
                {group.items.map((item) => (
                  <SidebarLink
                    key={item.href}
                    item={item}
                    active={isActive(item.href)}
                    collapsed={collapsed}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-border/60 p-3">
          <div
            className={`flex items-center gap-2 rounded-xl bg-sidebar-accent/60 p-2 ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            {!collapsed ? (
              <p className="text-[11px] leading-snug text-muted-foreground">
                ข้อมูลการแข่งขันในประเทศไทย อัปเดตโดยทีมและอาจารย์
              </p>
            ) : null}
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col lg:pl-[var(--sidebar-width,15.5rem)]">
        <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8 xl:px-10">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              aria-label={collapsed ? "ขยายแผงนำทาง" : "ยุบแผงนำทาง"}
              className="hidden h-10 w-10 shrink-0 rounded-xl lg:inline-flex"
            >
              {collapsed ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </Button>

            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {user?.role === "teacher" ? "TechComp Studio" : "TechComp Hub"}
              </p>
              <p className="truncate text-sm font-semibold text-foreground">
                {currentTitle}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {user ? (
                <DropdownMenu
                  open={notificationsOpen}
                  onOpenChange={setNotificationsOpen}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="การแจ้งเตือน"
                      className="relative h-10 w-10 rounded-xl"
                    >
                      <Bell className="h-4 w-4" />
                      {unreadCount > 0 ? (
                        <span className="absolute -right-1 -top-1 rounded-full bg-destructive px-1 font-mono text-[10px] font-semibold tabular-nums text-destructive-foreground">
                          {unreadCount}
                        </span>
                      ) : null}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80">
                    <NotificationList
                      notifications={notifications}
                      unreadCount={unreadCount}
                      onMarkAllRead={() => void markAllRead()}
                      onNavigate={() => setNotificationsOpen(false)}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}

              <Button
                type="button"
                variant="outline"
                onClick={() => openPalette()}
                aria-label="เปิดคำสั่งด่วน (Ctrl+K)"
                className="hidden h-10 items-center gap-2 rounded-xl border-border/60 bg-surface-subtle px-3 text-muted-foreground hover:text-foreground sm:inline-flex"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                <span className="hidden max-w-[260px] truncate text-xs lg:inline">
                  ค้นหาการแข่งขัน ทีม หรือเพื่อน...
                </span>
                <kbd className="font-mono text-[10px]">⌘K</kbd>
              </Button>

              <ThemeToggle />

              {user ? (
                <>
                  <Button
                    size="sm"
                    className="hidden h-10 gap-1.5 rounded-xl bg-primary px-4 text-primary-foreground hover:bg-primary/90 sm:inline-flex"
                    onClick={() => setSmartModalOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    เพิ่มรายการ
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`บัญชีของ ${user.full_name || user.email}`}
                        className="h-10 gap-2 rounded-xl border-border/60 bg-background pl-1.5 pr-2.5 hover:bg-muted/50"
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="bg-muted text-[10px] font-semibold text-foreground">
                            {getInitials(user.full_name, user.email)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="hidden max-w-[120px] truncate text-xs font-medium text-foreground sm:inline">
                          {user.full_name || user.email}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {user.role === "teacher" ? "ผู้ดูแลระบบ" : "นักเรียน"}
                        </span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel className="space-y-0.5">
                        <p className="truncate text-sm font-medium">
                          {user.full_name}
                          {user.nickname ? ` (${user.nickname})` : ""}
                        </p>
                        <p className="truncate text-xs font-normal text-muted-foreground">
                          {user.email}
                          {user.grade ? ` · ${user.grade}` : ""}
                        </p>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href="/profile" className="cursor-pointer">
                          <UserCircle2 className="mr-2 h-4 w-4" />
                          โปรไฟล์
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/people" className="cursor-pointer">
                          <Users className="mr-2 h-4 w-4" />
                          ผู้คน
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/my-teams" className="cursor-pointer">
                          <LayoutGrid className="mr-2 h-4 w-4" />
                          ทีมของฉัน
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/settings" className="cursor-pointer">
                          <Settings className="mr-2 h-4 w-4" />
                          ตั้งค่า
                        </Link>
                      </DropdownMenuItem>
                      {user.role === "teacher" ? (
                        <>
                          <DropdownMenuItem asChild>
                            <Link href="/teacher/review" className="cursor-pointer">
                              <ClipboardCheck className="mr-2 h-4 w-4" />
                              คิวตรวจรายการ
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href="/teacher/reports" className="cursor-pointer">
                              <ChartNoAxesCombined className="mr-2 h-4 w-4" />
                              รายงานโรงเรียน
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href="/admin" className="cursor-pointer">
                              <ShieldCheck className="mr-2 h-4 w-4" />
                              ผู้ดูแลระบบ
                            </Link>
                          </DropdownMenuItem>
                        </>
                      ) : null}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={loggingOut}
                        onClick={handleLogout}
                        className="cursor-pointer text-destructive focus:text-destructive"
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        ออกจากระบบ
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <SmartAddModal
                    userRole={user.role}
                    open={smartModalOpen}
                    onOpenChange={setSmartModalOpen}
                  />
                </>
              ) : (
                <Button
                  asChild
                  size="sm"
                  className="h-10 gap-1.5 rounded-xl bg-primary px-4 text-primary-foreground hover:bg-primary/90"
                >
                  <Link href="/login">
                    <LogIn className="h-3.5 w-3.5" />
                    เข้าสู่ระบบ
                  </Link>
                </Button>
              )}

              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-xl lg:hidden"
                    aria-label="เปิดเมนูนำทาง"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-80">
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2 text-left text-sm font-semibold">
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background">
                        <Code2 className="h-4 w-4" />
                      </span>
                      TechComp Hub
                    </SheetTitle>
                    <SheetDescription className="text-left text-xs">
                      เมนูหลักสำหรับการแข่งขันและพื้นที่ทำงานของคุณ
                    </SheetDescription>
                  </SheetHeader>
                  <nav
                    aria-label="เมนูบนมือถือ"
                    className="mt-6 flex flex-col gap-1"
                  >
                    {flatNavItems.map((item) => (
                      <SidebarLink
                        key={`mobile-${item.href}`}
                        item={item}
                        active={isActive(item.href)}
                        collapsed={false}
                        onNavigate={() => setMobileOpen(false)}
                      />
                    ))}
                  </nav>
                  {user ? (
                    <Button
                      className="mt-4 w-full gap-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => {
                        setMobileOpen(false);
                        setSmartModalOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      เพิ่มรายการ
                    </Button>
                  ) : null}
                </SheetContent>
              </Sheet>

              <Sheet
                open={mobileNotificationsOpen}
                onOpenChange={setMobileNotificationsOpen}
              >
                <SheetContent
                  side="bottom"
                  className="mx-auto max-w-lg rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
                >
                  <SheetHeader>
                    <SheetTitle>การแจ้งเตือน</SheetTitle>
                    <SheetDescription className="sr-only">
                      รายการแจ้งเตือนล่าสุดของบัญชีนี้
                    </SheetDescription>
                  </SheetHeader>
                  <NotificationList
                    notifications={notifications}
                    unreadCount={unreadCount}
                    onMarkAllRead={() => void markAllRead()}
                    onNavigate={() => setMobileNotificationsOpen(false)}
                  />
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 pb-24 outline-none md:pb-0"
        >
          {children}
        </main>

        <div className="pb-16 md:pb-0">
          <Footer />
        </div>
      </div>

      <MobileBottomNav />
      <ServiceWorkerRegistrar />
      <ThemedToaster />
    </div>
  );
}
