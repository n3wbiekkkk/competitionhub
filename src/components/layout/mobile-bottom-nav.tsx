"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Home,
  Search,
  UserCircle2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useCommandPalette } from "@/components/command/command-context";

type BottomNavItem =
  | {
      kind: "link";
      id: string;
      label: string;
      icon: LucideIcon;
      href: string;
      active: boolean;
    }
  | {
      kind: "action";
      id: string;
      label: string;
      icon: LucideIcon;
      run: () => void;
    };

export function MobileBottomNav() {
  const pathname = usePathname();
  const { openNotifications } = useCommandPalette();

  const items: BottomNavItem[] = [
    {
      kind: "link",
      id: "feed",
      label: "รายการแข่งขัน",
      icon: Home,
      href: "/",
      active: pathname === "/",
    },
    {
      kind: "link",
      id: "teams",
      label: "ทีมของฉัน",
      icon: Search,
      href: "/my-teams",
      active: pathname.startsWith("/my-teams"),
    },
    {
      kind: "link",
      id: "people",
      label: "ผู้คน",
      icon: Users,
      href: "/people",
      active: pathname.startsWith("/people"),
    },
    {
      kind: "action",
      id: "notifications",
      label: "แจ้งเตือน",
      icon: Bell,
      run: openNotifications,
    },
    {
      kind: "link",
      id: "profile",
      label: "โปรไฟล์",
      icon: UserCircle2,
      href: "/profile",
      active: pathname.startsWith("/profile"),
    },
  ];

  return (
    <nav
      aria-label="เมนูด้านล่าง"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
    >
      <div className="grid h-14 grid-cols-5 items-stretch px-2 pt-1.5">
        {items.map((item) => {
          const Icon = item.icon;
          const className = `flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[10px] font-medium transition-colors ${
            item.kind === "link" && item.active
              ? "text-primary"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          }`;

          if (item.kind === "link") {
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={className}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={item.run}
              className={className}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
