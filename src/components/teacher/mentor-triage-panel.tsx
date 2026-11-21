"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import type { RealtimeEvent, MentorCheckinItem } from "@/lib/realtime/types";
import { MentorTriageRow, type MentorReviewInput } from "./mentor-triage-row";
import { useLiveUpdates } from "@/components/collab/use-live-updates";

type TriageRisk = "at_risk" | "blocked";

const TABS: { value: TriageRisk; label: string }[] = [
  { value: "at_risk", label: "ทีมเสี่ยง" },
  { value: "blocked", label: "ทีมติดปัญหา" },
];

export function MentorTriagePanel() {
  const [risk, setRisk] = useState<TriageRisk>("at_risk");
  const [checkins, setCheckins] = useState<MentorCheckinItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/teacher/checkins?risk=${risk}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { checkins: MentorCheckinItem[] };
      setCheckins(data.checkins);
    } catch {
      // Keep the last triage list visible on a transient failure.
    } finally {
      setLoading(false);
    }
  }, [risk]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(`/api/teacher/checkins?risk=${risk}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { checkins: MentorCheckinItem[] };
        setCheckins(data.checkins);
      } catch {
        // Keep the last triage list visible on a transient failure.
      } finally {
        setLoading(false);
      }
    })();
  }, [risk]);

  const handleEvent = useCallback(
    (event: RealtimeEvent) => {
      if (event.kind === "team_checkin") void load();
    },
    [load],
  );

  useLiveUpdates({ onEvent: handleEvent });

  const review = useCallback(
    async (input: MentorReviewInput) => {
      try {
        const response = await fetch("/api/teacher/checkins", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const data = (await response.json()) as {
          checkin?: MentorCheckinItem;
          error?: string;
        };
        const saved = data.checkin;
        if (!response.ok || !saved) throw new Error(data.error ?? "ไม่สามารถบันทึกข้อมูลได้");
        setCheckins((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
        toast.success("บันทึกคำแนะนำและแจ้งทีมแล้ว");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "ไม่สามารถบันทึกข้อมูลได้");
      }
    },
    [],
  );

  return (
    <section className="space-y-4" aria-label="ติดตามทีมโดยอาจารย์ที่ปรึกษา">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">ติดตามทีมที่ต้องการความช่วยเหลือ</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            รายงานประจำสัปดาห์ที่แจ้งสถานะเสี่ยงหรือติดปัญหา จะแสดงที่นี่เพื่อตรวจสอบและตอบกลับ
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-[10px] tabular-nums">
          {checkins.length} รายการ
        </Badge>
      </div>

      <div className="flex gap-4 border-b border-border" role="tablist" aria-label="กรองสถานะทีม">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={risk === tab.value}
            onClick={() => setRisk(tab.value)}
            className={`border-b-2 px-1 pb-2 text-xs font-medium transition-colors ${
              risk === tab.value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-8 text-center text-xs text-muted-foreground">กำลังโหลดรายงาน…</p>
      ) : checkins.length === 0 ? (
        <p className="py-10 text-center text-xs text-muted-foreground">
          ไม่มีรายงานในกลุ่มนี้ ลองตรวจสอบอีกครั้งหลังนักเรียนส่งรายงานประจำสัปดาห์
        </p>
      ) : (
        <div>
          {checkins.map((checkin) => (
            <MentorTriageRow key={checkin.id} checkin={checkin} onReview={review} />
          ))}
        </div>
      )}
    </section>
  );
}
