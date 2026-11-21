"use client";

import { useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { AccountSection } from "@/components/account/account-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    <Tabs defaultValue="outbox" className="gap-5">
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <TabsList
          variant="line"
          className="h-auto w-max min-w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0 group-data-horizontal/tabs:h-auto"
        >
          <TabsTrigger
            value="outbox"
            className="flex-none rounded-none px-0 pb-2.5 text-sm font-medium after:bg-primary group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold"
          >
            อีเมลที่รอส่ง
          </TabsTrigger>
          <TabsTrigger
            value="audit"
            className="flex-none rounded-none px-0 pb-2.5 text-sm font-medium after:bg-primary group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold"
          >
            บันทึกการดำเนินการ
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="outbox" className="mt-0">
        <AccountSection
          title="อีเมลที่รอส่ง"
          description="งานในคิว กรณี SMTP ยังไม่ได้ตั้งค่าจะแสดงสถานะรอส่ง"
        >
          <div className="max-h-[70vh] overflow-auto rounded-md border border-border">
            <div className="min-w-[640px]">
              <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_200px] gap-4 border-b border-border bg-background px-4 py-3.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <span>ผู้รับ / งาน</span>
                <span>การจัดการ</span>
              </div>
              <ul className="divide-y divide-border">
                {outbox.map((item) => (
                  <li
                    key={item.id}
                    className="grid grid-cols-[minmax(0,1fr)_200px] items-center gap-4 px-4 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">{item.to_email}</p>
                      <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
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
                        className="h-11 min-h-11 gap-2 rounded-lg sm:h-9 sm:min-h-9"
                      >
                        {busyId === item.id ? <Loader2 className="h-3.5 w-4 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                        ส่งใหม่
                      </Button>
                    </div>
                  </li>
                ))}
                {outbox.length === 0 ? (
                  <li className="px-4 py-3.5 text-sm text-muted-foreground">ไม่มีอีเมลในคิว</li>
                ) : null}
              </ul>
            </div>
          </div>
        </AccountSection>
      </TabsContent>

      <TabsContent value="audit" className="mt-0">
        <AccountSection title="บันทึกการดำเนินการ" description="เหตุการณ์ที่อาจารย์และผู้ดูแลระบบทำกับบัญชีและข้อมูลสำคัญ">
          <div className="max-h-[70vh] overflow-auto rounded-md border border-border">
            <div className="min-w-[640px]">
              <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_160px] gap-4 border-b border-border bg-background px-4 py-3.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <span>เหตุการณ์</span>
                <span>เวลา</span>
              </div>
              <ul className="divide-y divide-border">
                {auditLogs.map((item) => (
                  <li
                    key={item.id}
                    className="grid grid-cols-[minmax(0,1fr)_160px] items-center gap-4 px-4 py-3.5"
                  >
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
                  <li className="px-4 py-3.5 text-sm text-muted-foreground">ยังไม่มีบันทึก</li>
                ) : null}
              </ul>
            </div>
          </div>
        </AccountSection>
      </TabsContent>
    </Tabs>
  );
}
