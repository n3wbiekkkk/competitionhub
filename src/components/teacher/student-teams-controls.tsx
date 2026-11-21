"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { Loader2, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  studentTeamsPayloadSchema,
  type StudentTeamsPayload,
  type TeamFormationMode,
} from "@/lib/utils/teammate-match";

const MODE_LABELS: Record<TeamFormationMode, string> = {
  teacher_managed: "อาจารย์จัดทีมเท่านั้น",
  student_self_form: "นักเรียนตั้งทีมได้",
  hybrid: "นักเรียนตั้งทีมได้ · อาจารย์ตรวจสอบ",
};

function messageFrom(raw: unknown, fallback: string): string {
  if (typeof raw === "object" && raw !== null && "error" in raw) {
    const message = Reflect.get(raw, "error");
    if (typeof message === "string" && message.length > 0) return message;
  }
  return fallback;
}

export function StudentTeamsControls({
  competitionId,
}: {
  competitionId: string;
}) {
  const [payload, setPayload] = useState<StudentTeamsPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/student-teams`,
        { cache: "no-store" },
      );
      const raw: unknown = await response.json();
      if (!response.ok) {
        setError(messageFrom(raw, "ไม่สามารถโหลดทีมของนักเรียนได้"));
        return;
      }
      const parsed = z
        .object({ payload: studentTeamsPayloadSchema })
        .safeParse({ payload: raw });
      if (!parsed.success) {
        setError("ข้อมูลทีมของนักเรียนไม่ถูกต้อง");
        return;
      }
      setPayload(parsed.data.payload);
      setError(null);
    } catch {
      setError("ไม่สามารถโหลดทีมของนักเรียนได้");
    }
  }, [competitionId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function patch(
    body: Record<string, unknown>,
    successMessage: string,
  ): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/student-teams`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const raw: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(messageFrom(raw, successMessage));
        return;
      }
      toast.success(successMessage);
      await load();
    } catch {
      toast.error("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <section className="border-y border-border py-5 text-sm text-muted-foreground">
        {error}
      </section>
    );
  }
  if (!payload) {
    return (
      <section className="flex items-center gap-2 border-y border-border py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        กำลังโหลดทีมที่นักเรียนตั้งเอง
      </section>
    );
  }

  return (
    <section className="space-y-4 border-y border-border py-6" aria-label="ทีมที่นักเรียนตั้งเอง">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            ทีมที่นักเรียนตั้งเอง
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            ดูคำเชิญ อนุมัติทีมที่พร้อมแล้ว และล็อกการรับสมาชิก
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="rounded text-[10px]">
            ทีมนักเรียน{" "}
            <span className="ml-1 font-mono tabular-nums">
              {payload.teams.length}
            </span>
          </Badge>
          <Select
            value={payload.competition.team_formation_mode}
            disabled={busy}
            onValueChange={(value) => {
              if (
                value === "teacher_managed" ||
                value === "student_self_form" ||
                value === "hybrid"
              ) {
                void patch(
                  { action: "set_mode", team_formation_mode: value },
                  "อัปเดตโหมดการจัดทีมแล้ว",
                );
              }
            }}
          >
            <SelectTrigger className="h-8 w-56 rounded-md text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(MODE_LABELS) as TeamFormationMode[]).map((mode) => (
                <SelectItem key={mode} value={mode} className="text-xs">
                  {MODE_LABELS[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {payload.teams.length === 0 ? (
        <p className="py-4 text-xs text-muted-foreground">
          ยังไม่มีนักเรียนตั้งทีมในรายการนี้
        </p>
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {payload.teams.map((team) => (
            <div key={team.id} className="space-y-2 py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                    {team.name}
                    <Badge variant="outline" className="rounded text-[10px]">
                      ทีมนักเรียน
                    </Badge>
                    {team.recruitment_locked ? (
                      <Badge variant="outline" className="rounded text-[10px]">
                        ล็อกแล้ว
                      </Badge>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    สมาชิก{" "}
                    <span className="font-mono tabular-nums">
                      {team.members.length}
                    </span>
                    /{payload.competition.max_size} คน ·{" "}
                    {team.status === "confirmed"
                      ? "ยืนยันแล้ว"
                      : "รออาจารย์อนุมัติ"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {team.status === "draft" ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void patch(
                          { action: "approve", team_id: team.id },
                          "อนุมัติทีมแล้ว",
                        )
                      }
                      className="h-8 rounded-md text-xs"
                    >
                      อนุมัติทีม
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void patch(
                        {
                          action: "lock",
                          team_id: team.id,
                          locked: !team.recruitment_locked,
                        },
                        team.recruitment_locked
                          ? "ปลดล็อกการรับสมาชิกแล้ว"
                          : "ล็อกการรับสมาชิกแล้ว",
                      )
                    }
                    className="h-8 gap-1.5 rounded-md text-xs"
                  >
                    {team.recruitment_locked ? (
                      <Unlock className="h-3 w-3" />
                    ) : (
                      <Lock className="h-3 w-3" />
                    )}
                    {team.recruitment_locked ? "ปลดล็อก" : "ล็อกทีม"}
                  </Button>
                </div>
              </div>
              {team.invitations.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  คำเชิญ/คำขอค้างอยู่{" "}
                  <span className="font-mono tabular-nums">
                    {
                      team.invitations.filter((item) => item.status === "pending")
                        .length
                    }
                  </span>{" "}
                  รายการ
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
