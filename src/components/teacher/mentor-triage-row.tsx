"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RISK_LABELS_TH, type MentorCheckinItem } from "@/lib/realtime/types";
import { formatWeekRangeTh } from "@/lib/realtime/week";

export interface MentorReviewInput {
  checkinId: string;
  mentorNote: string | null;
  reviewed: boolean;
}

export interface MentorTriageRowProps {
  checkin: MentorCheckinItem;
  onReview: (input: MentorReviewInput) => Promise<void>;
}

export function MentorTriageRow({ checkin, onReview }: MentorTriageRowProps) {
  const [note, setNote] = useState(checkin.mentorNote ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(reviewed: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      await onReview({
        checkinId: checkin.id,
        mentorNote: note.trim() || null,
        reviewed,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="space-y-3 border-b border-border py-5 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            {checkin.teamName} · {checkin.competitionTitle}
          </p>
          <p className="text-xs text-muted-foreground">
            รายงานโดย {checkin.authorName}
            {checkin.nickname ? ` (${checkin.nickname})` : ""} ·{" "}
            <span className="font-mono tabular-nums">{formatWeekRangeTh(checkin.weekStart)}</span>
          </p>
        </div>
        <Badge variant={checkin.riskLevel === "blocked" ? "destructive" : "outline"}>
          {RISK_LABELS_TH[checkin.riskLevel]}
        </Badge>
      </div>

      <dl className="grid gap-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">ความคืบหน้า</dt>
          <dd className="mt-0.5 whitespace-pre-wrap text-foreground">{checkin.progress}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">อุปสรรค</dt>
          <dd className="mt-0.5 whitespace-pre-wrap text-foreground">
            {checkin.blockers ?? "ไม่มี"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">สิ่งที่จะทำต่อไป</dt>
          <dd className="mt-0.5 whitespace-pre-wrap text-foreground">{checkin.nextSteps}</dd>
        </div>
      </dl>

      <div className="space-y-2">
        <label className="block text-xs text-muted-foreground" htmlFor={`mentor-note-${checkin.id}`}>
          บันทึกของอาจารย์
        </label>
        <Textarea
          id={`mentor-note-${checkin.id}`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="ให้คำแนะนำหรือระบุความช่วยเหลือที่ทีมต้องการ"
          maxLength={2000}
          rows={2}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void submit(true)} disabled={busy}>
            {busy ? "กำลังบันทึก" : "บันทึกและแจ้งทีม"}
          </Button>
          {checkin.reviewedAt ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void submit(false)}
              disabled={busy}
            >
              ยกเลิกสถานะตรวจแล้ว
            </Button>
          ) : null}
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {checkin.reviewerName
              ? `ตรวจโดย ${checkin.reviewerName}`
              : "ยังไม่มีอาจารย์ตรวจสอบ"}
          </span>
        </div>
      </div>
    </article>
  );
}
