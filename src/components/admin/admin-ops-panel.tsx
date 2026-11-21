"use client";

import { useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { AccountSection } from "@/components/account/account-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatThaiDate } from "@/lib/utils/thai-date";
import type { AuditLogItem, OutboxItem } from "@/types/database";

export function AdminOpsPanel({
  outbox,
  auditLogs,
}: {
  outbox: OutboxItem[];
  auditLogs: AuditLogItem[];
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function retry(id: string) {
    setBusyId(id);
    try {
      const response = await fetch("/api/admin/outbox/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error("retry failed");
      toast.success("ส่งอีเมลใหม่แล้ว");
      window.location.reload();
    } catch {
      toast.error("ไม่สามารถส่งอีเมลใหม่ได้");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-10">
      <AccountSection
        title="อีเมลที่รอส่ง"
        description="งานในคิว กรณี SMTP ยังไม่ได้ตั้งค่าจะแสดงสถานะรอส่ง"
      >
        <ul className="divide-y divide-border border-y border-border">
          {outbox.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{item.to_email}</p>
                <p className="text-xs text-muted-foreground">
                  {item.template} · {formatThaiDate(item.created_at.slice(0, 10), "short")} · attempts {item.attempts}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="rounded-md">{item.status}</Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyId === item.id || item.status === "sent"}
                  onClick={() => void retry(item.id)}
                  className="gap-2 rounded-lg"
                >
                  {busyId === item.id ? <Loader2 className="h-3.5 w-4 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  ส่งใหม่
                </Button>
              </div>
            </li>
          ))}
          {outbox.length === 0 ? (
            <li className="py-4 text-sm text-muted-foreground">ไม่มีอีเมลในคิว</li>
          ) : null}
        </ul>
      </AccountSection>

      <AccountSection title="บันทึกการดำเนินการ" description="เหตุการณ์ที่อาจารย์และผู้ดูแลระบบทำกับบัญชีและข้อมูลสำคัญ">
        <ul className="divide-y divide-border border-y border-border">
          {auditLogs.map((item) => (
            <li key={item.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-foreground">{item.action}</p>
                <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {item.target_type} · {item.target_id ?? "-"}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatThaiDate(item.created_at.slice(0, 10), "short")}
              </p>
            </li>
          ))}
          {auditLogs.length === 0 ? (
            <li className="py-4 text-sm text-muted-foreground">ยังไม่มีบันทึก</li>
          ) : null}
        </ul>
      </AccountSection>
    </div>
  );
}
