"use client";

import { Check } from "lucide-react";
import type { ReadinessLevel, SubmissionReadiness } from "@/components/prep-studio/shared";

const LEVEL_LABEL_TH: Record<ReadinessLevel, string> = {
  empty: "เริ่มเตรียมผลงาน",
  building: "กำลังเตรียม",
  near: "ใกล้พร้อมส่ง",
  ready: "พร้อมส่งแล้ว",
};

interface SubmissionReadinessMeterProps {
  readiness: SubmissionReadiness;
  className?: string;
}

export function SubmissionReadinessMeter({
  readiness,
  className = "",
}: SubmissionReadinessMeterProps) {
  return (
    <section
      className={`space-y-4 border-y border-border py-5 ${className}`}
      aria-labelledby="readiness-heading"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground">
            ความพร้อมส่งผลงาน
          </p>
          <h3 id="readiness-heading" className="mt-1 text-lg font-semibold text-foreground">
            {LEVEL_LABEL_TH[readiness.level]}
          </h3>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-semibold tabular-nums text-primary">
            {readiness.score}
            <span className="ml-0.5 text-sm text-muted-foreground">/100</span>
          </p>
          <p className="text-xs text-muted-foreground">{readiness.countdown.label}</p>
        </div>
      </div>

      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={readiness.score}
        aria-label="คะแนนความพร้อมส่งผลงาน"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${readiness.score}%` }}
        />
      </div>

      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <p className="text-xs text-muted-foreground">
          งานที่เสร็จแล้ว{" "}
          <span className="font-mono tabular-nums text-foreground">
            {readiness.doneTasks}/{readiness.totalTasks}
          </span>{" "}
          · คะแนนงาน {readiness.taskPoints}/{readiness.taskMaxPoints}
        </p>
        <p className="text-xs text-muted-foreground">
          ลิงก์ผลงาน {readiness.deliverablePoints}/{readiness.deliverableMaxPoints}
        </p>
      </div>

      <ul className="divide-y divide-border border-t border-border">
        {readiness.checklist.map((item) => (
          <li key={item.id} className="flex items-center gap-2 py-2 text-sm">
            <span
              className={
                item.done
                  ? "inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  : "inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-muted-foreground"
              }
              aria-hidden="true"
            >
              {item.done ? <Check className="h-3 w-3" /> : null}
            </span>
            <span className={item.done ? "text-foreground" : "text-muted-foreground"}>
              {item.labelTh}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
