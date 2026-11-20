"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Radar,
  RotateCcw,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  ScoutProgressEvent,
  ScoutRunSummary,
  ScoutSourceDescriptor,
} from "@/lib/ai/scout";
import { TECH_CATEGORY_META, isTechCategory } from "@/lib/constants/tech-taxonomy";
import { formatThaiDate } from "@/lib/utils/thai-date";

interface ScoutRunnerDialogProps {
  onComplete?: (summary: ScoutRunSummary) => void;
  buttonLabel?: string;
  showReviewQueueLink?: boolean;
}

interface SourceStatusItem extends ScoutSourceDescriptor {
  status: "idle" | "scanning" | "done" | "error";
  foundCount: number;
}

type LogKind =
  | "info"
  | "fetch"
  | "extract"
  | "inserted"
  | "ignored"
  | "duplicate"
  | "error";

interface ActivityLogItem {
  id: string;
  time: string;
  tag: string;
  kind: LogKind;
  headline: string;
  detail?: string;
  url?: string;
}

function nowTimeLabel(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

const DEFAULT_SOURCES: SourceStatusItem[] = [
  {
    id: "hackza",
    name: "Hackza Thailand",
    target: "https://www.hackza.org/hackathons",
    status: "idle",
    foundCount: 0,
  },
  {
    id: "thailandhackathons",
    name: "Hackathon Thailand",
    target: "https://thailandhackathons.com/hackathons/bangkok",
    status: "idle",
    foundCount: 0,
  },
  {
    id: "portcas",
    name: "PorTCAS Thailand",
    target: "https://www.portcas.com/competition",
    status: "idle",
    foundCount: 0,
  },
  {
    id: "contester",
    name: "Contester Thailand",
    target: "https://contester.life/",
    status: "idle",
    foundCount: 0,
  },
  {
    id: "ctf_th",
    name: "CTF Thailand",
    target: "https://ctf.in.th/wp-json/wp/v2/posts",
    status: "idle",
    foundCount: 0,
  },
  {
    id: "gnews_th",
    name: "Google News Thailand",
    target:
      "hackathon OR CTF OR NSC OR แข่งขันเขียนโปรแกรม / AI / Robotics / Cyber Top Talent",
    status: "idle",
    foundCount: 0,
  },
];

export function ScoutRunnerDialog({
  onComplete,
  buttonLabel = "รัน AI ค้นหาในไทย",
  showReviewQueueLink = false,
}: ScoutRunnerDialogProps) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [phaseLabel, setPhaseLabel] = useState("พร้อมเริ่มต้นค้นหา");
  const [progressPct, setProgressPct] = useState(0);
  const [sources, setSources] = useState<SourceStatusItem[]>(DEFAULT_SOURCES);
  const [dedupStats, setDedupStats] = useState<{
    discoveredCandidates: number;
    alreadyInDb: number;
    toProcess: number;
  } | null>(null);
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);
  const [summary, setSummary] = useState<ScoutRunSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [logs.length]);

  function appendLog(item: Omit<ActivityLogItem, "id" | "time">) {
    seqRef.current += 1;
    setLogs((prev) => [
      ...prev,
      {
        id: `scout-log-${seqRef.current}`,
        time: nowTimeLabel(),
        ...item,
      },
    ]);
  }

  function handleStreamEvent(event: ScoutProgressEvent) {
    switch (event.type) {
      case "start": {
        setPhaseLabel("กำลังตรวจสอบรายการหมดเขตและเตรียมแหล่งข้อมูล...");
        setProgressPct(5);
        setSources(
          event.sources.map((s) => ({
            ...s,
            status: "idle",
            foundCount: 0,
          })),
        );
        appendLog({
          tag: "เริ่มต้น",
          kind: "info",
          headline: `เริ่มสแกนรายการแข่งขันสาย Tech ในไทย (${formatThaiDate(event.today, "long")})`,
        });
        break;
      }

      case "closed_expired": {
        setPhaseLabel("กำลังสแกน 6 แหล่งข่าวการแข่งขันในไทย...");
        setProgressPct(12);
        appendLog({
          tag: "ปิดหมดเขต",
          kind: "info",
          headline:
            event.count > 0
              ? `ปรับสถานะรายการที่เลยวันปิดรับแล้วเป็น "ปิดรับแล้ว" จำนวน ${event.count} รายการ`
              : "ไม่พบรายการเปิดรับที่เลยกำหนดเพิ่มเติม",
        });
        break;
      }

      case "source_start": {
        setSources((prev) =>
          prev.map((s) =>
            s.id === event.sourceId ? { ...s, status: "scanning" } : s,
          ),
        );
        break;
      }

      case "source_done": {
        setSources((prev) =>
          prev.map((s) =>
            s.id === event.sourceId
              ? {
                  ...s,
                  status: event.ok ? "done" : "error",
                  foundCount: event.foundCount,
                }
              : s,
          ),
        );
        appendLog({
          tag: event.sourceName,
          kind: event.ok ? "info" : "error",
          headline: event.ok
            ? `สแกนเสร็จสิ้น พบ ${event.foundCount} ลิงก์`
            : "ไม่สามารถดึงข้อมูลจากแหล่งนี้ได้",
        });
        break;
      }

      case "dedup_done": {
        setDedupStats({
          discoveredCandidates: event.discoveredCandidates,
          alreadyInDb: event.alreadyInDb,
          toProcess: event.toProcess,
        });
        setProgressPct(event.toProcess === 0 ? 100 : 28);
        setPhaseLabel(
          event.toProcess === 0
            ? "ไม่พบลิงก์ใหม่ที่ยังไม่อยู่ในระบบ"
            : `กำลังเตรียมวิเคราะห์ลิงก์ใหม่ ${event.toProcess} รายการด้วยระบบวิเคราะห์อัตโนมัติ`,
        );
        appendLog({
          tag: "คัดกรองลิงก์",
          kind: "info",
          headline: `พบลิงก์ทั้งหมด ${event.discoveredCandidates} ลิงก์ · มีในระบบแล้ว ${event.alreadyInDb} ลิงก์ · รอ AI ตรวจสอบ ${event.toProcess} ลิงก์`,
        });
        break;
      }

      case "candidate_fetch": {
        const basePct = 28;
        const span = 67;
        const pct = Math.min(
          95,
          Math.round(
            basePct + ((event.index - 0.5) / Math.max(1, event.total)) * span,
          ),
        );
        setProgressPct(pct);
        setPhaseLabel(
          `กำลังดึงเนื้อหาหน้าเว็บ (${event.index}/${event.total}) จาก ${event.sourceName}...`,
        );
        appendLog({
          tag: "ดึงเว็บ",
          kind: "fetch",
          headline: `[${event.index}/${event.total}] กำลังอ่านหน้าเว็บจาก ${event.sourceName}`,
          detail: event.url,
          url: event.url,
        });
        break;
      }

      case "candidate_extract": {
        const pct = Math.min(
          96,
          Math.round(28 + (event.index / Math.max(1, event.total)) * 65),
        );
        setProgressPct(pct);
        setPhaseLabel(
          `ระบบวิเคราะห์อัตโนมัติกำลังสกัดข้อมูลและคัดกรองสาย Tech (${event.index}/${event.total})...`,
        );
        appendLog({
          tag: "AI วิเคราะห์",
          kind: "extract",
          headline: `[${event.index}/${event.total}] ให้ AI วิเคราะห์ว่าเข้าข่ายสาย Tech ในไทยหรือไม่ และแปลงวันที่ พ.ศ.→ค.ศ.`,
          url: event.url,
        });
        break;
      }

      case "candidate_result": {
        const pct = Math.min(
          98,
          Math.round(28 + (event.index / Math.max(1, event.total)) * 70),
        );
        setProgressPct(pct);

        if (event.outcome === "inserted") {
          const catShort = isTechCategory(event.category)
            ? TECH_CATEGORY_META[event.category].shortLabel
            : (event.category ?? "Tech");
          appendLog({
            tag: "เพิ่มเข้าคิว",
            kind: "inserted",
            headline: event.title ?? event.url,
            detail: `${catShort} · ปิดรับ ${formatThaiDate(event.deadline ?? null, "short")} · บันทึกลงคิวรอตรวจสอบแล้ว`,
            url: event.url,
          });
        } else if (event.outcome === "ignored") {
          appendLog({
            tag: "ข้าม",
            kind: "ignored",
            headline: event.title || event.sourceName,
            detail: event.reason ?? "ไม่เข้าข่ายเงื่อนไขสาย Tech ในไทย",
            url: event.url,
          });
        } else if (event.outcome === "duplicate") {
          appendLog({
            tag: "ซ้ำในระบบ",
            kind: "duplicate",
            headline: event.title || event.sourceName,
            detail: event.reason,
            url: event.url,
          });
        } else {
          appendLog({
            tag: "ผิดพลาด",
            kind: "error",
            headline: event.sourceName,
            detail: event.reason ?? "เกิดข้อผิดพลาดระหว่างประมวลผล",
            url: event.url,
          });
        }
        break;
      }

      case "complete": {
        setProgressPct(100);
        setSummary(event.summary);
        setPhaseLabel(
          `ค้นหาเสร็จสิ้น: เพิ่มเข้าคิวใหม่ ${event.summary.insertedCount} รายการ`,
        );
        toast.success(
          `ค้นหาเสร็จสิ้น: พบรายการใหม่ ${event.summary.insertedCount} รายการ (ปิดรายการหมดเขต ${event.summary.closedExpiredCount} รายการ)`,
        );
        onComplete?.(event.summary);
        break;
      }

      case "error": {
        setErrorMessage(event.message);
        setPhaseLabel("เกิดข้อผิดพลาดระหว่างค้นหา");
        appendLog({
          tag: "ผิดพลาด",
          kind: "error",
          headline: event.message,
        });
        break;
      }
    }
  }

  async function startScout() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setRunning(true);
    setSummary(null);
    setErrorMessage(null);
    setDedupStats(null);
    setProgressPct(2);
    setPhaseLabel("กำลังเชื่อมต่อกับบริการวิเคราะห์อัตโนมัติ...");
    setSources(DEFAULT_SOURCES);
    setLogs([]);

    try {
      const response = await fetch("/api/teacher/scout?stream=1", {
        method: "POST",
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        let message = "ไม่สามารถเริ่มระบบค้นหา AI ได้";
        try {
          const errJson = (await response.json()) as { error?: string };
          if (errJson.error) message = errJson.error;
        } catch {
          // Ignore non-JSON error
        }
        setErrorMessage(message);
        setPhaseLabel("ไม่สามารถค้นหาได้");
        toast.error(message);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (line.length > 0) {
            try {
              const event = JSON.parse(line) as ScoutProgressEvent;
              handleStreamEvent(event);
            } catch {
              // Ignore malformed partial line
            }
          }
          newlineIndex = buffer.indexOf("\n");
        }
      }

      const trailing = buffer.trim();
      if (trailing.length > 0) {
        try {
          const event = JSON.parse(trailing) as ScoutProgressEvent;
          handleStreamEvent(event);
        } catch {
          // Ignore trailing noise
        }
      }
    } catch {
      if (controller.signal.aborted) {
        setPhaseLabel("หยุดการค้นหาแล้ว");
        appendLog({
          tag: "หยุดการทำงาน",
          kind: "info",
          headline: "ผู้ใช้หยุดการค้นหาชั่วคราว",
        });
      } else {
        const message = "เกิดข้อผิดพลาดในการเชื่อมต่อระหว่างรันการค้นหา กรุณาลองใหม่อีกครั้ง";
        setErrorMessage(message);
        setPhaseLabel("เกิดข้อผิดพลาดระหว่างค้นหา");
        toast.error(message);
      }
    } finally {
      setRunning(false);
    }
  }

  function handleOpenClick() {
    setOpen(true);
    void startScout();
  }

  function handleDialogOpenChange(nextOpen: boolean) {
    if (!nextOpen && running) {
      abortRef.current?.abort();
    }
    setOpen(nextOpen);
  }

  function getLogTagStyle(kind: LogKind): string {
    switch (kind) {
      case "inserted":
        return "border-primary/30 bg-primary/10 text-primary font-medium";
      case "extract":
      case "fetch":
        return "border-border bg-background text-foreground font-medium";
      case "error":
        return "border-destructive/30 bg-destructive/10 text-destructive font-medium";
      case "ignored":
      case "duplicate":
      case "info":
        return "border-border bg-muted/50 text-muted-foreground";
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleOpenClick}
        className="gap-1.5 rounded-md"
      >
        {running ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : (
          <Radar className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span>{running ? "AI กำลังค้นหา..." : buttonLabel}</span>
      </Button>

      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : summary ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <Radar className="h-4 w-4 text-muted-foreground" />
              )}
              <span>AI Tech Scout — ติดตามการทำงานแบบเรียลไทม์</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              สแกน 6 แหล่งประกาศการแข่งขันสายคอมพิวเตอร์ในไทย
              คัดกรองเฉพาะงานสาย Tech ในไทยด้วยระบบวิเคราะห์อัตโนมัติ
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto pr-1">
            {/* Live Phase & Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-foreground">
                  {phaseLabel}
                </span>
                <span className="font-mono font-semibold tabular-nums text-primary">
                  {progressPct}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {errorMessage ? (
                <p className="text-xs text-destructive">{errorMessage}</p>
              ) : null}
            </div>

            {/* 6 Thai Sources Grid */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                แหล่งข้อมูลและคำค้นหาที่ตรวจสอบ
              </p>
              <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2">
                {sources.map((src) => (
                  <div
                    key={src.id}
                    className="flex items-start justify-between gap-3 bg-background px-3 py-2"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-medium text-foreground">
                        {src.name}
                      </p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">
                        {src.target}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 pt-0.5 font-mono text-[11px] tabular-nums ${
                        src.status === "scanning"
                          ? "font-medium text-primary"
                          : src.status === "done"
                            ? "text-foreground"
                            : src.status === "error"
                              ? "text-destructive"
                              : "text-muted-foreground"
                      }`}
                    >
                      {src.status === "scanning"
                        ? "กำลังค้นหา..."
                        : src.status === "done"
                          ? `พบ ${src.foundCount}`
                          : src.status === "error"
                            ? "ล้มเหลว"
                            : "รอสแกน"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary Strip */}
            {(summary || dedupStats) ? (
              <div className="grid grid-cols-3 divide-x divide-border border-y border-border sm:grid-cols-5">
                <div className="px-3 py-2 first:pl-0">
                  <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
                    {summary?.discoveredCandidates ??
                      dedupStats?.discoveredCandidates ??
                      0}
                  </p>
                  <p className="text-[11px] text-muted-foreground">พบทั้งหมด</p>
                </div>
                <div className="px-3 py-2">
                  <p className="font-mono text-sm font-semibold tabular-nums text-muted-foreground">
                    {dedupStats?.alreadyInDb ?? 0}
                  </p>
                  <p className="text-[11px] text-muted-foreground">ซ้ำในระบบ</p>
                </div>
                <div className="px-3 py-2">
                  <p className="font-mono text-sm font-semibold tabular-nums text-primary">
                    {summary?.insertedCount ?? 0}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    เพิ่มเข้าคิว
                  </p>
                </div>
                <div className="px-3 py-2">
                  <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
                    {summary?.ignored.length ?? 0}
                  </p>
                  <p className="text-[11px] text-muted-foreground">คัดออก</p>
                </div>
                <div className="px-3 py-2 last:pr-0">
                  <p className="font-mono text-sm font-semibold tabular-nums text-muted-foreground">
                    {summary?.closedExpiredCount ?? 0}
                  </p>
                  <p className="text-[11px] text-muted-foreground">ปิดหมดเขต</p>
                </div>
              </div>
            ) : null}

            {/* Live Activity Log Stream */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>บันทึกการทำงาน (Activity Stream)</span>
                <span className="font-mono tabular-nums">
                  {logs.length} ขั้นตอน
                </span>
              </div>

              <div className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border bg-muted/20">
                {logs.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                    กำลังเริ่มต้นสแกน...
                  </div>
                ) : (
                  logs.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-2.5 px-3 py-2 text-xs"
                    >
                      <span className="shrink-0 pt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                        {entry.time}
                      </span>

                      <span
                        className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] whitespace-nowrap ${getLogTagStyle(entry.kind)}`}
                      >
                        {entry.tag}
                      </span>

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="leading-snug text-foreground">
                          {entry.headline}
                        </p>
                        {entry.detail ? (
                          <p className="break-all text-[11px] text-muted-foreground">
                            {entry.detail}
                          </p>
                        ) : null}
                      </div>

                      {entry.url ? (
                        <a
                          href={entry.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="เปิดลิงก์"
                          className="shrink-0 pt-0.5 text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            {running ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => abortRef.current?.abort()}
                className="gap-1.5 rounded-md text-destructive hover:text-destructive"
              >
                <Square className="h-3 w-3" />
                หยุดการค้นหา
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void startScout()}
                className="gap-1.5 rounded-md"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                รันอีกครั้ง
              </Button>
            )}

            <div className="flex items-center gap-2">
              {showReviewQueueLink && !running ? (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="rounded-md"
                >
                  <Link href="/teacher/review" onClick={() => setOpen(false)}>
                    ไปที่คิวตรวจสอบ
                  </Link>
                </Button>
              ) : null}

              <Button
                type="button"
                size="sm"
                onClick={() => handleDialogOpenChange(false)}
                className="rounded-md"
              >
                {running ? "หยุดและปิด" : "ปิดหน้าต่าง"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
