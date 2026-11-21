"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Copy, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AccountSection } from "@/components/account/account-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatThaiDate } from "@/lib/utils/thai-date";

interface GeneratedFeed {
  webcalUrl: string;
  httpsUrl: string;
  createdAt: string;
}

export function CalendarSubscriptionCard() {
  const [active, setActive] = useState(false);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [feed, setFeed] = useState<GeneratedFeed | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/calendar/token", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as {
          active: boolean;
          createdAt: string | null;
        };
        if (!cancelled) {
          setActive(data.active);
          setCreatedAt(data.createdAt);
        }
      } catch {
        // The status section can be retried by reloading the page.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function regenerate() {
    setBusy(true);
    try {
      const response = await fetch("/api/calendar/token", { method: "POST" });
      const data = (await response.json()) as GeneratedFeed & {
        error?: string;
      };
      if (!response.ok || !data.webcalUrl) {
        toast.error(data.error ?? "ไม่สามารถสร้างลิงก์ฟีดปฏิทินได้");
        return;
      }
      setFeed({
        webcalUrl: data.webcalUrl,
        httpsUrl: data.httpsUrl,
        createdAt: data.createdAt,
      });
      setActive(true);
      setCreatedAt(data.createdAt);
      toast.success("สร้างลิงก์ฟีดปฏิทินใหม่แล้ว");
    } catch {
      toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      const response = await fetch("/api/calendar/token", { method: "DELETE" });
      if (!response.ok) {
        toast.error("ไม่สามารถยกเลิกฟีดปฏิทินได้");
        return;
      }
      setActive(false);
      setCreatedAt(null);
      setFeed(null);
      toast.success("ยกเลิกการสมัครฟีดปฏิทินแล้ว");
    } catch {
      toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("คัดลอกลิงก์แล้ว");
    } catch {
      toast.error("ไม่สามารถคัดลอกลิงก์ได้");
    }
  }

  return (
    <AccountSection
      id="calendar-subscription"
      title="ฟีดปฏิทินส่วนตัว"
      description="สมัครฟีดปฏิทินเพื่อดูกำหนดปิดรับสมัครและงานทีมในแอปปฏิทินของคุณ"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={active ? "default" : "secondary"} className="rounded-md">
            {active ? "เปิดใช้งาน" : "ยังไม่ได้เปิดใช้งาน"}
          </Badge>
          {createdAt ? (
            <span className="text-xs text-muted-foreground">
              สร้างเมื่อ {formatThaiDate(createdAt.slice(0, 10), "short")}
            </span>
          ) : null}
        </div>

        {feed ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">ลิงก์สำหรับแอปปฏิทิน (webcal)</p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={feed.webcalUrl}
                  aria-label="ลิงก์ฟีดปฏิทิน webcal"
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="คัดลอกลิงก์ webcal"
                  onClick={() => void copyUrl(feed.webcalUrl)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">ลิงก์ HTTPS สำหรับนำเข้าไฟล์ .ics</p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={feed.httpsUrl}
                  aria-label="ลิงก์ฟีดปฏิทิน HTTPS"
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="คัดลอกลิงก์ HTTPS"
                  onClick={() => void copyUrl(feed.httpsUrl)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              ลิงก์นี้แสดงเฉพาะตอนสร้างเท่านั้น หากทำหายให้สร้างลิงก์ใหม่และนำเข้าในปฏิทินอีกครั้ง
            </p>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            ฟีดจะรวมการแข่งขันที่บันทึกไว้ กำหนดส่งที่คุณแสดงความสนใจ และงานที่มอบหมายในทีมที่ยืนยันแล้ว
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="gap-2 rounded-lg"
            disabled={busy}
            onClick={() => void regenerate()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {active ? "สร้างลิงก์ใหม่" : "สร้างลิงก์ฟีด"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="gap-2 rounded-lg"
            disabled={busy || !active}
            onClick={() => void revoke()}
          >
            <Trash2 className="h-3.5 w-3.5" />
            ยกเลิกการสมัคร
          </Button>
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          ข้อมูลในฟีดเป็นส่วนตัว อย่าแชร์ลิงก์นี้ให้ผู้อื่น
        </p>
      </div>
    </AccountSection>
  );
}
