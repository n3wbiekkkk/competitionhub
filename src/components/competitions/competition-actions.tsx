"use client";

import { useState } from "react";
import { CalendarPlus, Check, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  formatThaiDate,
  normalizeToIsoCeDate,
  parseIsoDateParts,
} from "@/lib/utils/thai-date";

interface CompetitionActionsProps {
  competitionId: string;
  title: string;
  deadline: string | null;
  summary: string | null;
  sourceUrl: string | null;
  categoryLabel: string;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatIcsDateValue(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

function formatIcsTimestampUtc(now: Date): string {
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}T${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}Z`;
}

export function CompetitionActions({
  competitionId,
  title,
  deadline,
  summary,
  sourceUrl,
  categoryLabel,
}: CompetitionActionsProps) {
  const [copied, setCopied] = useState(false);

  const normalizedDeadline = normalizeToIsoCeDate(deadline);
  const deadlineParts = normalizedDeadline
    ? parseIsoDateParts(normalizedDeadline)
    : null;

  async function handleCopyShare() {
    const shareUrl = `${window.location.origin}/competitions/${competitionId}`;
    const deadlineLabel = formatThaiDate(normalizedDeadline, "long");
    const lines = [
      title,
      `หมวด: ${categoryLabel} · ปิดรับสมัคร: ${deadlineLabel}`,
      shareUrl,
    ];

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      toast.success("คัดลอกข้อมูลและลิงก์สำหรับแชร์แล้ว");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("ไม่สามารถคัดลอกลิงก์ได้ กรุณาคัดลอกจากแถบ URL");
    }
  }

  function handleDownloadIcs() {
    if (!deadlineParts) return;

    const dtStart = formatIcsDateValue(
      deadlineParts.year,
      deadlineParts.month,
      deadlineParts.day,
    );
    const nextUtcDay = new Date(
      Date.UTC(deadlineParts.year, deadlineParts.month - 1, deadlineParts.day + 1),
    );
    const dtEnd = formatIcsDateValue(
      nextUtcDay.getUTCFullYear(),
      nextUtcDay.getUTCMonth() + 1,
      nextUtcDay.getUTCDate(),
    );

    const detailUrl = `${window.location.origin}/competitions/${competitionId}`;
    const descParts = [
      `หมวด: ${categoryLabel}`,
      summary ? summary.trim() : "",
      sourceUrl ? `ประกาศต้นทาง: ${sourceUrl}` : "",
      `TechComp Hub: ${detailUrl}`,
    ].filter(Boolean);

    const icsLines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//TechComp Hub//Competition Calendar//TH",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:techcomp-${competitionId}@techcomphub`,
      `DTSTAMP:${formatIcsTimestampUtc(new Date())}`,
      `DTSTART;VALUE=DATE:${dtStart}`,
      `DTEND;VALUE=DATE:${dtEnd}`,
      `SUMMARY:${escapeIcsText(`ปิดรับสมัคร: ${title}`)}`,
      `DESCRIPTION:${escapeIcsText(descParts.join("\n\n"))}`,
      `URL:${detailUrl}`,
      "BEGIN:VALARM",
      "TRIGGER:-P3D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcsText(`อีก 3 วันปิดรับสมัคร: ${title}`)}`,
      "END:VALARM",
      "BEGIN:VALARM",
      "TRIGGER:-P1D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcsText(`พรุ่งนี้ปิดรับสมัคร: ${title}`)}`,
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ];

    const blob = new Blob([`${icsLines.join("\r\n")}\r\n`], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `techcomp-${competitionId.slice(0, 8)}.ics`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    toast.success("ดาวน์โหลดไฟล์ปฏิทิน (.ics) แล้ว");
  }

  return (
    <div
      className={
        deadlineParts ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 gap-2"
      }
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleCopyShare}
        className="gap-1.5 rounded-md text-xs"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Share2 className="h-3.5 w-3.5" />
        )}
        คัดลอกลิงก์แชร์
      </Button>

      {deadlineParts ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDownloadIcs}
          className="gap-1.5 rounded-md text-xs"
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          เพิ่มลงปฏิทิน (.ics)
        </Button>
      ) : null}
    </div>
  );
}
