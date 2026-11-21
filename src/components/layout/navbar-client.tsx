"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  ClipboardCheck,
  Code2,
  LogIn,
  LogOut,
  Menu,
  Plus,
  Settings,
  ShieldCheck,
  UserCircle2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { getInitials } from "@/lib/utils/initials";
import { SmartAddModal } from "@/components/competitions/smart-add-modal";
import { ThemeToggle } from "@/components/theme/theme-toggle";
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
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { Profile } from "@/types/database";

import type { NotificationItem } from "@/types/database";

interface NavbarClientProps {
  user: Profile | null;
  pendingReviewCount: number;
}

export function NavbarClient({ user, pendingReviewCount }: NavbarClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [smartModalOpen, setSmartModalOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const response = await fetch("/api/notifications");
        if (!response.ok) return;
        const data = (await response.json()) as { notifications: NotificationItem[] };
        setNotifications(data.notifications);
      } catch {
        // Bell remains usable after a page refresh.
      }
    })();
  }, [user]);

  async function markAllRead() {
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!response.ok) throw new Error("mark failed");
      setNotifications((prev) => prev.map((item) => ({ ...item, read_at: new Date().toISOString() })));
    } catch {
      toast.error("ไม่สามารถอัปเดตการแจ้งเตือนได้");
    }
  }

  const unreadCount = notifications.filter((item) => !item.read_at).length;

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

  const navItems = [
    {
      href: "/",
      label: "รายการแข่งขัน",
      show: true,
      badge: 0,
    },
    {
      href: "/people",
      label: "ผู้คน",
      show: Boolean(user),
      badge: 0,
    },
    {
      href: "/my-teams",
      label: "ทีมของฉัน",
      show: Boolean(user),
      badge: 0,
    },
    {
      href: "/profile",
      label: "โปรไฟล์",
      show: Boolean(user),
      badge: 0,
    },
    {
      href: "/teacher/review",
      label: "คิวตรวจรายการ",
      show: user?.role === "teacher",
      badge: pendingReviewCount,
    },
    {
      href: "/admin",
      label: "ผู้ดูแลระบบ",
      show: user?.role === "teacher",
      badge: 0,
    },
  ].filter((item) => item.show);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background">
              <Code2 className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-foreground">
              TechComp Hub
            </span>
          </Link>

          <nav aria-label="เมนูหลัก" className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                    active
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span>{item.label}</span>
                  {item.badge > 0 ? (
                    <span className="font-mono text-xs font-semibold tabular-nums text-primary">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="การแจ้งเตือน" className="relative">
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 ? (
                    <span className="absolute -right-1 -top-1 rounded-full bg-destructive px-1 font-mono text-[10px] font-semibold text-destructive-foreground tabular-nums">
                      {unreadCount}
                    </span>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <div className="flex items-center justify-between px-3 py-2">
                  <p className="text-sm font-medium">การแจ้งเตือน</p>
                  {unreadCount > 0 ? (
                    <button type="button" onClick={() => void markAllRead()} className="text-xs text-primary hover:underline">
                      อ่านทั้งหมด
                    </button>
                  ) : null}
                </div>
                {notifications.slice(0, 8).map((item) => (
                  <DropdownMenuItem key={item.id} asChild>
                    <Link href={item.href ?? "/"} className="cursor-pointer">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{item.title}</p>
                        {item.body ? <p className="truncate text-xs text-muted-foreground">{item.body}</p> : null}
                      </div>
                    </Link>
                  </DropdownMenuItem>
                ))}
                {notifications.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-muted-foreground">ยังไม่มีการแจ้งเตือน</p>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          <ThemeToggle />

          {user ? (
            <>
              <Button
                size="sm"
                className="hidden sm:inline-flex gap-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
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
                    className="gap-2 rounded-md border-border bg-background pl-1.5 pr-2.5 hover:bg-muted/50"
                  >
                    <Avatar className="h-5 w-5">
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
                      <Users className="mr-2 h-4 w-4" />
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
              className="gap-1.5 rounded-md bg-primary px-3.5 text-primary-foreground hover:bg-primary/90"
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
                className="md:hidden"
                aria-label="เปิดเมนูนำทาง"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-left text-sm font-semibold">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background">
                    <Code2 className="h-4 w-4" />
                  </div>
                  TechComp Hub
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 flex flex-col gap-1">
                <nav aria-label="เมนูบนมือถือ" className="flex flex-col gap-1">
                  {navItems.map((item) => {
                    const active =
                      item.href === "/"
                        ? pathname === "/"
                        : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                          active
                            ? "bg-muted font-medium text-foreground"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        }`}
                      >
                        <span>{item.label}</span>
                        {item.badge > 0 ? (
                          <span className="font-mono text-xs font-semibold tabular-nums text-primary">
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                  {user ? (
                    <>
                      <Link
                        href="/settings"
                        aria-current={
                          pathname.startsWith("/settings") ? "page" : undefined
                        }
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                          pathname.startsWith("/settings")
                            ? "bg-muted font-medium text-foreground"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        }`}
                      >
                        <span>ตั้งค่า</span>
                      </Link>
                    </>
                  ) : null}
                </nav>

                {user ? (
                  <Button
                    className="mt-3 w-full gap-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => {
                      setMobileOpen(false);
                      setSmartModalOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    เพิ่มรายการ
                  </Button>
                ) : null}

                <div className="mt-3 border-t border-border px-1 pt-3 text-xs text-muted-foreground">
                  ธีมสามารถเปลี่ยนได้จากปุ่มสลับโหมดด้านบน
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
