"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { NotificationItem } from "@/types/database";
import type { RealtimeEvent } from "@/lib/realtime/types";
import { useLiveUpdates } from "./use-live-updates";

const STATUS_LABEL = {
  connecting: "กำลังเชื่อมต่อ",
  live: "อัปเดตสด",
  polling: "โหมดสำรอง",
  offline: "ออฟไลน์",
} as const;

export interface NotificationBellProps {
  userId: string | null;
}

export function NotificationBell({ userId }: NotificationBellProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { notifications: NotificationItem[] };
      setNotifications(data.notifications);
    } catch {
      // The bell can still be refreshed manually from the page.
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void (async () => {
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { notifications: NotificationItem[] };
        setNotifications(data.notifications);
      } catch {
        // The bell can still be refreshed manually from the page.
      }
    })();
  }, [userId]);

  const handleEvent = useCallback(
    (event: RealtimeEvent) => {
      if (event.kind === "notification") {
        void refresh();
        return;
      }
      if (
        event.kind === "team_message" ||
        event.kind === "team_task" ||
        event.kind === "team_checkin"
      ) {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => router.refresh(), 500);
      }
    },
    [refresh, router],
  );

  const { status } = useLiveUpdates({ enabled: Boolean(userId), onEvent: handleEvent });

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  async function markAllRead() {
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!response.ok) throw new Error("mark failed");
      setNotifications((prev) =>
        prev.map((item) => ({ ...item, read_at: new Date().toISOString() })),
      );
    } catch {
      toast.error("ไม่สามารถอัปเดตการแจ้งเตือนได้");
    }
  }

  if (!userId) return null;
  const unreadCount = notifications.filter((item) => !item.read_at).length;

  return (
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
          <div>
            <p className="text-sm font-medium">การแจ้งเตือน</p>
            <p className="text-[11px] text-muted-foreground">{STATUS_LABEL[status]}</p>
          </div>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="text-xs text-primary hover:underline"
            >
              อ่านทั้งหมด
            </button>
          ) : null}
        </div>
        {notifications.slice(0, 8).map((item) => (
          <DropdownMenuItem key={item.id} asChild>
            <Link href={item.href ?? "/"} className="cursor-pointer">
              <div className="min-w-0">
                <p className="truncate text-sm">{item.title}</p>
                {item.body ? (
                  <p className="truncate text-xs text-muted-foreground">{item.body}</p>
                ) : null}
              </div>
            </Link>
          </DropdownMenuItem>
        ))}
        {notifications.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">ยังไม่มีการแจ้งเตือน</p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
