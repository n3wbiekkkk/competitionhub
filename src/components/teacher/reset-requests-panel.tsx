"use client";

import { useState } from "react";
import { Copy, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AccountSection } from "@/components/account/account-section";
import { formatThaiDate } from "@/lib/utils/thai-date";
import type { PasswordResetRequest } from "@/types/database";

export function ResetRequestsPanel({
  requests,
}: {
  requests: PasswordResetRequest[];
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});

  async function issueLink(id: string) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/admin/reset-requests/${id}/link`, {
        method: "POST",
      });
      const data = (await response.json()) as { link?: string; error?: string };
      if (!response.ok || !data.link) {
        toast.error(data.error ?? "ไม่สามารถสร้างลิงก์ได้");
        return;
      }
      setLinks((prev) => ({ ...prev, [id]: data.link! }));
      navigator.clipboard?.writeText(data.link).catch(() => undefined);
      toast.success("สร้างลิงก์แล้ว กรุณาส่งให้เจ้าของบัญชีผ่านช่องทางส่วนตัว");
    } catch {
      toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setBusyId(null);
    }
  }

  if (requests.length === 0) return null;

  return (
    <AccountSection
      title="คำขอรีเซ็ตรหัสผ่าน"
      description="ตรวจสอบตัวตนผ่านช่องทางของโรงเรียนก่อนส่งลิงก์ที่สร้างขึ้นให้เจ้าของบัญชี"
    >
      <ul className="divide-y divide-border border-y border-border">
        {requests.map((request) => (
          <li key={request.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {request.full_name ?? "ผู้ใช้"}
              </p>
              <p className="truncate text-xs text-muted-foreground">{request.email ?? ""}</p>
              <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                ขอเมื่อ {formatThaiDate(request.requested_at.slice(0, 10), "short")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {links[request.id] ? (
                <>
                  <input
                    readOnly
                    aria-label="ลิงก์รีเซ็ต"
                    value={links[request.id]}
                    className="h-9 w-56 rounded-lg border border-border bg-muted px-2 font-mono text-[11px] text-muted-foreground"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-2 rounded-lg"
                    onClick={() => navigator.clipboard?.writeText(links[request.id])}
                  >
                    <Copy className="h-3.5 w-3.5" /> คัดลอก
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={busyId === request.id}
                  onClick={() => void issueLink(request.id)}
                  className="gap-2 rounded-lg"
                >
                  {busyId === request.id ? <Loader2 className="h-3.5 w-4 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                  สร้างลิงก์รีเซ็ต
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        ลิงก์ใช้ได้ครั้งเดียวและหมดอายุภายใน 30 นาที ระบบเก็บเฉพาะรหัสยืนยันของลิงก์ ไม่เก็บข้อความจริง
      </p>
    </AccountSection>
  );
}
