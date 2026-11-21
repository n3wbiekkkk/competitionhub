"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RISK_LABELS_TH, riskLevelSchema, type RealtimeEvent, type RiskLevel, type TeamCheckinItem } from "@/lib/realtime/types";
import { formatWeekRangeTh, getWeekStartIso } from "@/lib/realtime/week";
import { getTodayIsoBangkok, normalizeToIsoCeDate } from "@/lib/utils/thai-date";
import { useLiveUpdates } from "./use-live-updates";

export interface WeeklyCheckinFormProps {
  teamId: string;
  currentUserId: string;
  initialCheckin?: TeamCheckinItem;
  enabled?: boolean;
}

interface FormState {
  weekStart: string;
  progress: string;
  blockers: string;
  nextSteps: string;
  riskLevel: RiskLevel;
}

function initialState(checkin?: TeamCheckinItem): FormState {
  return {
    weekStart: checkin?.weekStart ?? getWeekStartIso(getTodayIsoBangkok()),
    progress: checkin?.progress ?? "",
    blockers: checkin?.blockers ?? "",
    nextSteps: checkin?.nextSteps ?? "",
    riskLevel: checkin?.riskLevel ?? "on_track",
  };
}

export function WeeklyCheckinForm({
  teamId,
  currentUserId,
  initialCheckin,
  enabled = true,
}: WeeklyCheckinFormProps) {
  const [form, setForm] = useState<FormState>(() => initialState(initialCheckin));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(initialCheckin?.updatedAt ?? null);

  const loadWeek = useCallback(async () => {
    try {
      const response = await fetch(`/api/teams/${teamId}/checkins`, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { checkins: TeamCheckinItem[] };
      const current = data.checkins.find((item) => item.weekStart === form.weekStart);
      if (!current || current.authorId !== currentUserId) return;
      setForm(initialState(current));
      setSavedAt(current.updatedAt);
    } catch {
      // Keep the user's draft if the refresh fails.
    }
  }, [currentUserId, form.weekStart, teamId]);

  const handleEvent = useCallback(
    (event: RealtimeEvent) => {
      if (event.kind === "team_checkin" && event.teamId === teamId) void loadWeek();
    },
    [loadWeek, teamId],
  );

  useLiveUpdates({ enabled, onEvent: handleEvent });

  async function submit() {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/teams/${teamId}/checkins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart: form.weekStart,
          progress: form.progress,
          blockers: form.blockers || null,
          nextSteps: form.nextSteps,
          riskLevel: form.riskLevel,
        }),
      });
      const data = (await response.json()) as { checkin?: TeamCheckinItem; error?: string };
      const saved = data.checkin;
      if (!response.ok || !saved) {
        throw new Error(data.error ?? "ไม่สามารถบันทึกข้อมูลได้");
      }
      setSavedAt(saved.updatedAt);
      toast.success("บันทึกรายงานประจำสัปดาห์แล้ว");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ไม่สามารถบันทึกรายงานได้");
    } finally {
      setSaving(false);
    }
  }

  const risk = riskLevelSchema.safeParse(form.riskLevel).success
    ? form.riskLevel
    : "on_track";

  return (
    <section className="space-y-4 border-t border-border pt-6" aria-label="รายงานประจำสัปดาห์">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">รายงานความคืบหน้าประจำสัปดาห์</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatWeekRangeTh(form.weekStart)} · อัปเดตให้อาจารย์ที่ปรึกษาทราบทุกสัปดาห์
          </p>
        </div>
        <Badge variant={risk === "blocked" ? "destructive" : "outline"} className="text-[10px]">
          {RISK_LABELS_TH[risk]}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs text-muted-foreground">
          สัปดาห์ที่รายงาน
          <input
            type="date"
            value={form.weekStart}
            onChange={(event) => {
              const normalized = normalizeToIsoCeDate(event.target.value);
              setForm((prev) => ({
                ...prev,
                weekStart: normalized ? getWeekStartIso(normalized) : prev.weekStart,
              }));
            }}
            className="block w-full rounded-md border border-border bg-background px-2.5 py-2 font-mono text-xs tabular-nums text-foreground"
          />
        </label>
        <label className="space-y-1.5 text-xs text-muted-foreground">
          สถานะทีม
          <select
            value={form.riskLevel}
            onChange={(event) => {
              const parsed = riskLevelSchema.safeParse(event.target.value);
              if (parsed.success) setForm((prev) => ({ ...prev, riskLevel: parsed.data }));
            }}
            className="block w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs text-foreground"
          >
            {(Object.keys(RISK_LABELS_TH) as RiskLevel[]).map((value) => (
              <option key={value} value={value}>
                {RISK_LABELS_TH[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1.5 text-xs text-muted-foreground">
        ความคืบหน้า
        <Textarea
          value={form.progress}
          onChange={(event) => setForm((prev) => ({ ...prev, progress: event.target.value }))}
          placeholder="สิ่งที่ทีมทำสำเร็จในสัปดาห์นี้"
          maxLength={2000}
          rows={2}
        />
      </label>
      <label className="block space-y-1.5 text-xs text-muted-foreground">
        อุปสรรค (ถ้ามี)
        <Textarea
          value={form.blockers}
          onChange={(event) => setForm((prev) => ({ ...prev, blockers: event.target.value }))}
          placeholder="ปัญหาที่ต้องให้อาจารย์ช่วย"
          maxLength={2000}
          rows={2}
        />
      </label>
      <label className="block space-y-1.5 text-xs text-muted-foreground">
        สิ่งที่จะทำต่อไป
        <Textarea
          value={form.nextSteps}
          onChange={(event) => setForm((prev) => ({ ...prev, nextSteps: event.target.value }))}
          placeholder="เป้าหมายของสัปดาห์หน้า"
          maxLength={2000}
          rows={2}
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] tabular-nums text-muted-foreground">
          {savedAt ? "บันทึกล่าสุดแล้ว" : "ยังไม่เคยบันทึกสัปดาห์นี้"}
        </p>
        <Button
          size="sm"
          onClick={() => void submit()}
          disabled={saving || !form.progress.trim() || !form.nextSteps.trim()}
        >
          {saving ? "กำลังบันทึก" : "บันทึกรายงาน"}
        </Button>
      </div>
    </section>
  );
}
