"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  DELIVERABLE_KINDS,
  DELIVERABLE_LABELS_TH,
  deliverableResponseSchema,
  deliverablesPayloadSchema,
  errorResponseSchema,
  importResponseSchema,
  reviewResponseSchema,
  roadmapResponseSchema,
  type DeliverableKind,
  type DeliverablesPayload,
} from "@/components/prep-studio/shared";
import { SubmissionReadinessMeter } from "@/components/prep-studio/submission-readiness-meter";
import type {
  RoadmapPlan,
  RubricReviewPlan,
} from "@/components/prep-studio/shared";
import { formatThaiDate } from "@/lib/utils/thai-date";

interface PrepStudioProps {
  teamId: string;
  teamName?: string;
}

interface DeliverableForm {
  title: string;
  kind: DeliverableKind;
  url: string;
  note: string;
}

const EMPTY_FORM: DeliverableForm = {
  title: "",
  kind: "source_code",
  url: "",
  note: "",
};

function parseErrorBody(data: unknown): string {
  const parsed = errorResponseSchema.safeParse(data);
  return parsed.success
    ? parsed.data.error
    : "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";
}

function isDeliverableKind(value: string): value is DeliverableKind {
  return (DELIVERABLE_KINDS as readonly string[]).includes(value);
}

async function readJson(response: Response): Promise<unknown> {
  return await response.json().catch(() => null);
}

function formatDueDate(isoDate: string | null): string {
  return isoDate ? formatThaiDate(isoDate, "short") : "ไม่ระบุกำหนด";
}

export function PrepStudio({ teamId, teamName }: PrepStudioProps) {
  const [payload, setPayload] = useState<DeliverablesPayload | null>(null);
  const [roadmap, setRoadmap] = useState<RoadmapPlan | null>(null);
  const [review, setReview] = useState<RubricReviewPlan | null>(null);
  const [roadmapStale, setRoadmapStale] = useState(false);
  const [reviewStale, setReviewStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<"roadmap" | "review" | "import" | "form" | null>(null);
  const [form, setForm] = useState<DeliverableForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  const refreshDeliverables = useCallback(async () => {
    const response = await fetch(`/api/teams/${teamId}/deliverables`, {
      cache: "no-store",
    });
    const data = await readJson(response);
    if (!response.ok) throw new Error(parseErrorBody(data));
    const parsed = deliverablesPayloadSchema.safeParse(data);
    if (!parsed.success) throw new Error("ข้อมูลความพร้อมของทีมไม่ถูกต้อง");
    setPayload(parsed.data);
  }, [teamId]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [roadmapRes, reviewRes] = await Promise.all([
          fetch(`/api/teams/${teamId}/ai-roadmap`, { cache: "no-store" }),
          fetch(`/api/teams/${teamId}/ai-review`, { cache: "no-store" }),
        ]);
        const [roadmapData, reviewData] = await Promise.all([
          readJson(roadmapRes),
          readJson(reviewRes),
        ]);
        const roadmapParsed = roadmapResponseSchema.safeParse(roadmapData);
        const reviewParsed = reviewResponseSchema.safeParse(reviewData);
        if (!active) return;
        if (roadmapParsed.success) {
          setRoadmap(roadmapParsed.data.plan);
          setRoadmapStale(roadmapParsed.data.stale);
        }
        if (reviewParsed.success) {
          setReview(reviewParsed.data.plan);
          setReviewStale(reviewParsed.data.stale);
        }
        await refreshDeliverables();
      } catch (error) {
        if (active) {
          toast.error(
            error instanceof Error
              ? error.message
              : "ไม่สามารถโหลดข้อมูลสตูดิโอได้",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [refreshDeliverables, teamId]);

  async function generateRoadmap() {
    setWorking("roadmap");
    try {
      const response = await fetch(`/api/teams/${teamId}/ai-roadmap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(parseErrorBody(data));
      const parsed = roadmapResponseSchema.safeParse(data);
      if (!parsed.success || !parsed.data.plan) {
        throw new Error("ผลลัพธ์แผนการแข่งขันไม่ถูกต้อง");
      }
      setRoadmap(parsed.data.plan);
      setRoadmapStale(false);
      toast.success(
        parsed.data.cached
          ? "โหลดแผนที่เคยสร้างสำหรับข้อมูลชุดนี้"
          : "สร้างแผนการแข่งขันด้วย AI แล้ว",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "สร้างแผนไม่สำเร็จ");
    } finally {
      setWorking(null);
    }
  }

  async function generateReview() {
    setWorking("review");
    try {
      const response = await fetch(`/api/teams/${teamId}/ai-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(parseErrorBody(data));
      const parsed = reviewResponseSchema.safeParse(data);
      if (!parsed.success || !parsed.data.plan) {
        throw new Error("ผลลัพธ์การตรวจ Rubric ไม่ถูกต้อง");
      }
      setReview(parsed.data.plan);
      setReviewStale(false);
      toast.success(
        parsed.data.cached
          ? "โหลดผลตรวจที่เคยสร้างสำหรับข้อมูลชุดนี้"
          : "ตรวจผลงานด้วย Rubric แล้ว",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ตรวจผลงานไม่สำเร็จ");
    } finally {
      setWorking(null);
    }
  }

  async function importMilestones() {
    setWorking("import");
    try {
      const response = await fetch(`/api/teams/${teamId}/ai-roadmap/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(parseErrorBody(data));
      const parsed = importResponseSchema.safeParse(data);
      if (!parsed.success) throw new Error("ผลการนำเข้าแผนไม่ถูกต้อง");
      await refreshDeliverables();
      toast.success(
        `นำเป้าหมายเข้างานของทีมแล้ว ${parsed.data.imported} รายการ (มีอยู่แล้ว ${parsed.data.skipped} รายการ)`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "นำเข้าแผนไม่สำเร็จ");
    } finally {
      setWorking(null);
    }
  }

  function startEdit(item: DeliverablesPayload["deliverables"][number]) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      kind: item.kind,
      url: item.url,
      note: item.note ?? "",
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function submitDeliverable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking("form");
    try {
      const endpoint = editingId
        ? `/api/teams/${teamId}/deliverables/${editingId}`
        : `/api/teams/${teamId}/deliverables`;
      const response = await fetch(endpoint, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          kind: form.kind,
          url: form.url,
          note: form.note.trim() || null,
        }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(parseErrorBody(data));
      const parsed = deliverableResponseSchema.safeParse(data);
      if (!parsed.success) throw new Error("ข้อมูลลิงก์ผลงานไม่ถูกต้อง");
      resetForm();
      await refreshDeliverables();
      toast.success(editingId ? "แก้ไขลิงก์ผลงานแล้ว" : "เพิ่มลิงก์ผลงานแล้ว");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "บันทึก.lิงก์ไม่สำเร็จ");
    } finally {
      setWorking(null);
    }
  }

  async function deleteDeliverable(id: string) {
    setWorking("form");
    try {
      const response = await fetch(`/api/teams/${teamId}/deliverables/${id}`, {
        method: "DELETE",
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(parseErrorBody(data));
      await refreshDeliverables();
      if (editingId === id) resetForm();
      toast.success("ลบลิงก์ผลงานแล้ว");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ลบลิงก์ไม่สำเร็จ");
    } finally {
      setWorking(null);
    }
  }

  if (loading || !payload) {
    return (
      <div className="flex items-center gap-2 border-y border-border py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        กำลังโหลดสตูดิโอเตรียมส่งผลงาน...
      </div>
    );
  }

  return (
    <section className="space-y-6 border-t border-border pt-8" aria-label="AI Competition Coach และ Prep Studio">
      <div className="space-y-1.5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground">
          AI Competition Coach
        </p>
        <h2 className="text-lg font-semibold text-foreground">
          สตูดิโอเตรียมส่งผลงาน{teamName ? ` · ${teamName}` : ""}
        </h2>
        <p className="text-sm text-muted-foreground">
          วางแผนรายสัปดาห์ ตรวจผลงานตาม Rubric และรวมลิงก์ผลงานไว้ในที่เดียว
        </p>
      </div>

      <SubmissionReadinessMeter readiness={payload.readiness} />

      <Tabs defaultValue="roadmap">
        <TabsList variant="line" className="h-auto w-full justify-start gap-5 rounded-none border-b border-border bg-transparent p-0 group-data-horizontal/tabs:h-auto">
          <TabsTrigger value="roadmap" className="h-9 rounded-none px-0">แผนการแข่งขัน</TabsTrigger>
          <TabsTrigger value="review" className="h-9 rounded-none px-0">ตรวจด้วย Rubric</TabsTrigger>
          <TabsTrigger value="links" className="h-9 rounded-none px-0">ลิงก์ผลงาน</TabsTrigger>
          <TabsTrigger value="tasks" className="h-9 rounded-none px-0">งานของทีม</TabsTrigger>
        </TabsList>

        <TabsContent value="roadmap" className="space-y-5 pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void generateRoadmap()} disabled={working !== null}>
              {working === "roadmap" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {roadmap ? "สร้างแผนใหม่ด้วย AI" : "สร้างแผนด้วย AI"}
            </Button>
            {roadmap ? (
              <Button size="sm" variant="outline" onClick={() => void importMilestones()} disabled={working !== null}>
                {working === "import" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                นำเป้าหมายขึ้นงานของทีม
              </Button>
            ) : null}
            {roadmapStale ? (
              <span className="text-xs text-muted-foreground">
                ข้อมูลทีมเปลี่ยนไปหลังสร้างแผน ควรสร้างแผนใหม่อีกครั้ง
              </span>
            ) : null}
          </div>

          {roadmap ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-sm text-foreground">{roadmap.summaryTh}</p>
                <div className="flex flex-wrap gap-1.5">
                  {roadmap.suggestedStack.map((item) => (
                    <span key={item} className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <ol className="divide-y divide-border border-y border-border">
                {roadmap.weeks.map((week) => (
                  <li key={week.week} className="py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {week.labelTh} · {week.focusTh}
                      </p>
                      <p className="font-mono text-xs tabular-nums text-muted-foreground">
                        {formatDueDate(week.dueDate)}
                      </p>
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {week.tasksTh.map((task) => (
                        <li key={task}>{task}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-foreground">
                      เป้าหมาย: {week.milestoneTh}
                    </p>
                  </li>
                ))}
              </ol>

              <div className="space-y-1.5">
                <p className="text-xs font-medium tracking-wide text-muted-foreground">ความเสี่ยงที่ควรระวัง</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {roadmap.risksTh.map((risk) => (
                    <li key={risk}>{risk}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="border-y border-border py-8 text-sm text-muted-foreground">
              ยังไม่มีแผนการแข่งขัน กดสร้างแผนด้วย AI เพื่อรับตารางงานรายสัปดาห์
              สแตกที่แนะนำ และความเสี่ยงที่ควรป้องกัน
            </p>
          )}
        </TabsContent>

        <TabsContent value="review" className="space-y-5 pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void generateReview()} disabled={working !== null}>
              {working === "review" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {review ? "ตรวจใหม่ด้วย AI" : "ตรวจผลงานด้วย Rubric"}
            </Button>
            {reviewStale ? (
              <span className="text-xs text-muted-foreground">
                มีงานหรือลิงก์ผลงานเปลี่ยนไปหลังการตรวจ ควรตรวจใหม่อีกครั้ง
              </span>
            ) : null}
          </div>

          {review ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border pb-4">
                <p className="max-w-xl text-sm text-foreground">{review.summaryTh}</p>
                <p className="font-mono text-xl font-semibold tabular-nums text-primary">
                  {review.totalScore}/{review.maxScore}
                </p>
              </div>

              <ul className="divide-y divide-border border-b border-border">
                {review.scores.map((score) => (
                  <li key={score.dimensionId} className="space-y-2 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">{score.labelTh}</p>
                      <p className="font-mono text-xs tabular-nums text-muted-foreground">
                        {score.score}/{score.maxScore}
                      </p>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${Math.round((score.score / score.maxScore) * 100)}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">หลักฐาน: {score.evidenceTh}</p>
                    <p className="text-xs text-foreground">ปรับปรุง: {score.improvementTh}</p>
                  </li>
                ))}
              </ul>

              <div className="space-y-2">
                <p className="text-xs font-medium tracking-wide text-muted-foreground">
                  สิ่งที่ควรทำก่อนส่งงาน
                </p>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground">
                  {review.topImprovementsTh.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </div>

              {review.missingItemsTh.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground">
                    สิ่งที่ยังขาด
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {review.missingItemsTh.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <p className="border-t border-border pt-4 text-sm text-foreground">
                {review.verdictTh}
              </p>
            </div>
          ) : (
            <p className="border-y border-border py-8 text-sm text-muted-foreground">
              ยังไม่มีผลตรวจ Rubric กดตรวจผลงานเพื่อดูคะแนนรายด้านและคำแนะนำที่ทำได้จริง
            </p>
          )}
        </TabsContent>

        <TabsContent value="links" className="space-y-6 pt-6">
          <form onSubmit={(event) => void submitDeliverable(event)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="prep-deliverable-title">ชื่อผลงาน</Label>
                <Input
                  id="prep-deliverable-title"
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="เช่น ระบบจับคู่ทีมด้วย AI"
                  maxLength={120}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prep-deliverable-kind">ประเภท</Label>
                <Select
                  value={form.kind}
                  onValueChange={(value) => {
                    if (isDeliverableKind(value)) setForm({ ...form, kind: value });
                  }}
                >
                  <SelectTrigger id="prep-deliverable-kind" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DELIVERABLE_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {DELIVERABLE_LABELS_TH[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prep-deliverable-url">ลิงก์สาธารณะ (http/https)</Label>
              <Input
                id="prep-deliverable-url"
                type="url"
                value={form.url}
                onChange={(event) => setForm({ ...form, url: event.target.value })}
                placeholder="https://github.com/..."
                maxLength={2000}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prep-deliverable-note">หมายเหตุ (ไม่บังคับ)</Label>
              <Textarea
                id="prep-deliverable-note"
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
                maxLength={500}
                rows={2}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={working !== null}>
                {working === "form" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {editingId ? "บันทึกการแก้ไข" : "เพิ่มลิงก์ผลงาน"}
              </Button>
              {editingId ? (
                <Button type="button" size="sm" variant="ghost" onClick={resetForm}>
                  ยกเลิก
                </Button>
              ) : null}
            </div>
          </form>

          {payload.deliverables.length === 0 ? (
            <p className="border-y border-border py-8 text-sm text-muted-foreground">
              ยังไม่มีลิงก์ผลงาน เพิ่มลิงก์ซอร์สโค้ด เอกสารรายงาน และวิดีโอสาธิต
              เพื่อให้คะแนนความพร้อมส่งงานเพิ่มขึ้น
            </p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {payload.deliverables.map((item) => (
                <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {DELIVERABLE_LABELS_TH[item.kind]}
                    </p>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block break-all text-xs text-primary hover:underline"
                    >
                      {item.url}
                    </a>
                    {item.note ? (
                      <p className="text-xs text-muted-foreground">{item.note}</p>
                    ) : null}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="แก้ไขลิงก์ผลงาน"
                      onClick={() => startEdit(item)}
                      disabled={working !== null}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="ลบลิงก์ผลงาน"
                      onClick={() => void deleteDeliverable(item.id)}
                      disabled={working !== null}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="tasks" className="pt-6">
          {payload.tasks.length === 0 ? (
            <p className="border-y border-border py-8 text-sm text-muted-foreground">
              ยังไม่มีงานในทีม เมื่อสร้างแผนด้วย AI แล้วกดนำเป้าหมายขึ้นงานของทีม
              งานจะปรากฏที่นี่
            </p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {payload.tasks.map((task) => (
                <li key={task.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                  <p className="text-sm text-foreground">{task.title}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{task.status === "done" ? "เสร็จแล้ว" : task.status === "doing" ? "กำลังทำ" : "ยังไม่เริ่ม"}</span>
                    <span className="font-mono tabular-nums">
                      {formatDueDate(task.due_date)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        กำหนดปิดรับของการแข่งขัน: {formatThaiDate(payload.competition.deadline, "long")}
      </p>
    </section>
  );
}

export function PrepStudioAddButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" size="xs" variant="outline" onClick={onClick}>
      <Plus className="h-3 w-3" />
      เปิดสตูดิโอ
    </Button>
  );
}
