"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Edit3,
  ExternalLink,
  Plus,
  Save,
  Search,
  Trash2,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { SmartAddModal } from "@/components/competitions/smart-add-modal";
import { ScoutRunnerDialog } from "@/components/teacher/scout-runner-dialog";
import type { ScoutRunSummary } from "@/lib/ai/scout";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  COMPETITION_STATUS_META,
  TECH_CATEGORIES,
  TECH_CATEGORY_META,
  getCompetitionSourceLabel,
  isTechCategory,
  type CompetitionStatus,
  type TechCategory,
  type UserRole,
} from "@/lib/constants/tech-taxonomy";
import { formatThaiDate } from "@/lib/utils/thai-date";
import type { Competition } from "@/types/database";

export interface ReviewCompetitionItem extends Competition {
  interest_count: number;
  submitter_name: string | null;
  submitter_role: UserRole | null;
}

interface ReviewQueueClientProps {
  initialCompetitions: ReviewCompetitionItem[];
}

interface EditDraft {
  title: string;
  category: TechCategory;
  deadline: string;
  min_size: number;
  max_size: number;
  summary: string;
}

export function ReviewQueueClient({
  initialCompetitions,
}: ReviewQueueClientProps) {
  const router = useRouter();
  const [competitions, setCompetitions] =
    useState<ReviewCompetitionItem[]>(initialCompetitions);
  const [deleteCandidate, setDeleteCandidate] =
    useState<ReviewCompetitionItem | null>(null);
  const [activeTab, setActiveTab] =
    useState<CompetitionStatus>("pending_review");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Server refresh produces a new prop. Adopt it during render (React's
  // documented "adjust state on prop change" pattern) unless a teacher is
  // mid-edit, so their draft is not silently thrown away.
  const [syncedSource, setSyncedSource] = useState(initialCompetitions);
  if (syncedSource !== initialCompetitions && !editingId && !deleteCandidate) {
    setSyncedSource(initialCompetitions);
    setCompetitions(initialCompetitions);
  }

  const counts = useMemo(
    () => ({
      pending_review: competitions.filter((c) => c.status === "pending_review")
        .length,
      open: competitions.filter((c) => c.status === "open").length,
      closed: competitions.filter((c) => c.status === "closed").length,
      rejected: competitions.filter((c) => c.status === "rejected").length,
    }),
    [competitions],
  );

  function beginEdit(item: ReviewCompetitionItem) {
    setEditingId(item.id);
    setEditDraft({
      title: item.title,
      category: item.category,
      deadline: item.deadline ?? "",
      min_size: item.min_size,
      max_size: item.max_size,
      summary: item.summary ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
  }

  async function handleSaveEdit(id: string) {
    if (!editDraft) return;
    setBusyId(id);

    try {
      const response = await fetch(`/api/competitions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editDraft.title,
          category: editDraft.category,
          deadline: editDraft.deadline.trim() || null,
          min_size: editDraft.min_size,
          max_size: Math.max(editDraft.min_size, editDraft.max_size),
          summary: editDraft.summary,
        }),
      });
      const data = (await response.json()) as {
        competition?: Competition;
        error?: string;
      };
      if (!response.ok || !data.competition) {
        toast.error(data.error ?? "ไม่สามารถบันทึกการแก้ไขได้");
        return;
      }

      setCompetitions((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...data.competition } : c)),
      );
      toast.success("บันทึกข้อมูลรายการแข่งขันเรียบร้อย");
      cancelEdit();
      router.refresh();
    } catch {
      toast.error("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
      setBusyId(null);
    }
  }

  async function handleStatusChange(
    id: string,
    nextStatus: CompetitionStatus,
    successMessage: string,
  ) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/competitions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = (await response.json()) as {
        competition?: Competition;
        error?: string;
      };
      if (!response.ok || !data.competition) {
        toast.error(data.error ?? "ไม่สามารถเปลี่ยนสถานะได้");
        return;
      }

      setCompetitions((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...data.competition } : c)),
      );
      toast.success(successMessage);
      router.refresh();
    } catch {
      toast.error("เกิดข้อผิดพลาดในการอัปเดตสถานะ");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/competitions/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        toast.error(data.error ?? "ไม่สามารถลบรายการได้");
        return;
      }
      setCompetitions((prev) => prev.filter((c) => c.id !== id));
      setDeleteCandidate(null);
      toast.success("ลบรายการแข่งขันเรียบร้อย");
      router.refresh();
    } catch {
      toast.error("เกิดข้อผิดพลาดในการลบรายการ");
    } finally {
      setBusyId(null);
    }
  }

  async function handleScoutComplete(summary: ScoutRunSummary) {
    try {
      const listRes = await fetch("/api/competitions?status=all");
      if (listRes.ok) {
        const listData = (await listRes.json()) as {
          competitions?: Array<
            Competition & {
              interest_count: number;
              submitter_role: UserRole | null;
            }
          >;
        };
        if (listData.competitions) {
          setCompetitions(
            listData.competitions.map((item) => ({
              ...item,
              submitter_name: null,
            })),
          );
        }
      }
      if (summary.insertedCount > 0) {
        setActiveTab("pending_review");
      }
      router.refresh();
    } catch {
      router.refresh();
    }
  }

  const visibleItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return competitions.filter((c) => {
      if (c.status !== activeTab) return false;
      if (!q) return true;
      const catMeta = TECH_CATEGORY_META[c.category];
      const haystack = [
        c.title,
        c.category,
        catMeta.labelTh,
        catMeta.shortLabel,
        c.summary ?? "",
        c.eligibility ?? "",
        c.submitter_name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [competitions, activeTab, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Canvas Header */}
      <section className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground">
            ระบบจัดการสำหรับอาจารย์
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            คิวตรวจและจัดการรายการแข่งขันสาย Tech
          </h1>
          <p className="text-sm text-muted-foreground">
            ตรวจสอบรายการที่ระบบสกัดเข้ามาหรือนักเรียนส่งเสนอ
            แก้ไขรายละเอียดและอนุมัติขึ้นบอร์ดได้ทันที
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <ScoutRunnerDialog onComplete={handleScoutComplete} />
          <SmartAddModal
            userRole="teacher"
            onCreated={() => router.refresh()}
            trigger={
              <Button size="sm" className="gap-1.5 rounded-md">
                <Plus className="h-4 w-4" />
                เพิ่มรายการแข่งขัน
              </Button>
            }
          />
        </div>
      </section>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (
            value === "pending_review" ||
            value === "open" ||
            value === "closed" ||
            value === "rejected"
          ) {
            setActiveTab(value);
          }
        }}
      >
        <div className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
          <TabsList
            variant="line"
            className="h-auto flex-wrap justify-start gap-5 rounded-none bg-transparent p-0 group-data-horizontal/tabs:h-auto"
          >
            <TabsTrigger
              value="pending_review"
              className="flex-none gap-2 rounded-none px-0 pb-2 text-sm font-medium after:bg-primary group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold"
            >
              <span>รอตรวจสอบ</span>
              <span className="font-mono text-xs tabular-nums text-primary">
                {counts.pending_review}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="open"
              className="flex-none gap-2 rounded-none px-0 pb-2 text-sm font-medium after:bg-primary group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold"
            >
              <span>เปิดรับสมัคร</span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {counts.open}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="closed"
              className="flex-none gap-2 rounded-none px-0 pb-2 text-sm font-medium after:bg-primary group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold"
            >
              <span>ปิดรับแล้ว</span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {counts.closed}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="rejected"
              className="flex-none gap-2 rounded-none px-0 pb-2 text-sm font-medium after:bg-primary group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold"
            >
              <span>ไม่ผ่านอนุมัติ</span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {counts.rejected}
              </span>
            </TabsTrigger>
          </TabsList>

          <div className="relative w-full lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="กรองตามชื่อรายการ, หมวด, หรือผู้เสนอ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 rounded-md pl-8 pr-8 text-sm"
            />
            {searchQuery.length > 0 ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="ล้างคำค้นหา"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        <TabsContent value={activeTab} className="mt-0">
          {visibleItems.length === 0 ? (
            <div className="border-b border-border py-14 text-center">
              <p className="text-sm text-muted-foreground">
                {searchQuery.trim()
                  ? "ไม่พบรายการแข่งขันที่ตรงกับคำค้นหาในแท็บนี้"
                  : `ไม่มีรายการแข่งขันในสถานะ "${COMPETITION_STATUS_META[activeTab].labelTh}"`}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {visibleItems.map((item) => {
                const isEditing = editingId === item.id && editDraft !== null;
                const isBusy = busyId === item.id;
                const catMeta = TECH_CATEGORY_META[item.category];
                const sourceLabel = getCompetitionSourceLabel(
                  item.source_type,
                  item.submitter_role,
                );

                return (
                  <article key={item.id} className="space-y-3 py-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium text-foreground/80">
                          {catMeta.labelTh}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{sourceLabel}</span>
                        {item.submitter_name ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>โดย {item.submitter_name}</span>
                          </>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2 tabular-nums">
                        <span>สนใจ {item.interest_count} คน</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          ทีม {item.min_size}–{item.max_size} คน
                        </span>
                      </div>
                    </div>

                    {!isEditing ? (
                      <div className="space-y-2.5">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                          <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
                            <Link
                              href={`/competitions/${item.id}`}
                              className="transition-colors hover:text-primary"
                            >
                              {item.title}
                            </Link>
                          </h2>

                          <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span className="tabular-nums">
                              ปิดรับ{" "}
                              <strong className="font-medium text-foreground">
                                {formatThaiDate(item.deadline, "long")}
                              </strong>
                            </span>
                            {item.source_url ? (
                              <a
                                href={item.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                              >
                                ต้นทาง
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : null}
                          </div>
                        </div>

                        {item.summary ? (
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            {item.summary}
                          </p>
                        ) : null}

                        {item.eligibility ? (
                          <p className="text-xs text-muted-foreground">
                            <strong className="font-medium text-foreground">
                              คุณสมบัติ:
                            </strong>{" "}
                            {item.eligibility}
                          </p>
                        ) : null}

                        {item.recommended_roles.length > 0 ||
                        item.tech_stack_hints.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {item.recommended_roles.map((role) => (
                              <span
                                key={role}
                                className="rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground/80"
                              >
                                {role}
                              </span>
                            ))}
                            {item.tech_stack_hints.map((tech) => (
                              <span
                                key={tech}
                                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                              >
                                {tech}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {isEditing && editDraft ? (
                      <div className="grid gap-3 rounded-md border border-border bg-muted/25 p-4 sm:grid-cols-2">
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label>ชื่อรายการแข่งขัน</Label>
                          <Input
                            value={editDraft.title}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                title: e.target.value,
                              })
                            }
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label>หมวดสาย Tech</Label>
                          <Select
                            value={editDraft.category}
                            onValueChange={(value) => {
                              if (isTechCategory(value)) {
                                setEditDraft({
                                  ...editDraft,
                                  category: value,
                                });
                              }
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TECH_CATEGORIES.map((cat) => (
                                <SelectItem key={cat} value={cat}>
                                  {TECH_CATEGORY_META[cat].labelTh}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label>วันปิดรับสมัคร (ค.ศ.)</Label>
                          <Input
                            type="date"
                            value={editDraft.deadline}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                deadline: e.target.value,
                              })
                            }
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label>สมาชิกขั้นต่ำ</Label>
                          <Input
                            type="number"
                            min={1}
                            max={20}
                            value={editDraft.min_size}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                min_size: Math.max(
                                  1,
                                  Number(e.target.value) || 1,
                                ),
                              })
                            }
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label>สมาชิกสูงสุด</Label>
                          <Input
                            type="number"
                            min={editDraft.min_size}
                            max={20}
                            value={editDraft.max_size}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                max_size: Math.max(
                                  editDraft.min_size,
                                  Number(e.target.value) || editDraft.min_size,
                                ),
                              })
                            }
                          />
                        </div>

                        <div className="space-y-1.5 sm:col-span-2">
                          <Label>สรุปรายละเอียด</Label>
                          <Textarea
                            rows={3}
                            value={editDraft.summary}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                summary: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      {isEditing ? (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={isBusy}
                            onClick={() => handleSaveEdit(item.id)}
                            className="rounded-md"
                          >
                            <Save className="mr-1.5 h-3.5 w-3.5" />
                            บันทึกการแก้ไข
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEdit}
                            className="rounded-md"
                          >
                            <X className="mr-1.5 h-3.5 w-3.5" />
                            ยกเลิก
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => beginEdit(item)}
                            className="h-8 rounded-md text-xs"
                          >
                            <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                            แก้ไขด่วน
                          </Button>

                          {item.status !== "open" ? (
                            <Button
                              size="sm"
                              disabled={isBusy}
                              onClick={() =>
                                handleStatusChange(
                                  item.id,
                                  "open",
                                  "อนุมัติรายการแข่งขันขึ้นบอร์ดแล้ว",
                                )
                              }
                              className="h-8 rounded-md text-xs"
                            >
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                              อนุมัติขึ้นบอร์ด
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isBusy}
                              onClick={() =>
                                handleStatusChange(
                                  item.id,
                                  "closed",
                                  "ปิดรับสมัครรายการนี้แล้ว",
                                )
                              }
                              className="h-8 rounded-md text-xs"
                            >
                              ปิดรับสมัคร
                            </Button>
                          )}

                          {item.status === "pending_review" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isBusy}
                              className="h-8 rounded-md text-xs text-destructive hover:text-destructive"
                              onClick={() =>
                                handleStatusChange(
                                  item.id,
                                  "rejected",
                                  "ปฏิเสธรายการแข่งขันแล้ว",
                                )
                              }
                            >
                              <XCircle className="mr-1.5 h-3.5 w-3.5" />
                              ปฏิเสธ
                            </Button>
                          ) : null}

                          {item.status === "open" || item.status === "closed" ? (
                            <Button
                              asChild
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-md text-xs"
                            >
                              <Link
                                href={`/teacher/competitions/${item.id}/teams`}
                              >
                                <Users className="mr-1.5 h-3.5 w-3.5" />
                                จัดทีม ({item.interest_count})
                              </Link>
                            </Button>
                          ) : null}
                        </div>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isBusy}
                        className="h-8 rounded-md text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteCandidate(item)}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        ลบ
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={deleteCandidate !== null}
        onOpenChange={(open) => {
          if (!open && !busyId) setDeleteCandidate(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ลบรายการแข่งขันนี้?</DialogTitle>
            <DialogDescription>
              “{deleteCandidate?.title}” และข้อมูลการลงชื่อ/ทีมที่เกี่ยวข้องจะถูกลบถาวร
              หากต้องการเก็บประวัติ ให้เลือกปิดรับสมัครแทน
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={Boolean(busyId)}
              onClick={() => setDeleteCandidate(null)}
            >
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              disabled={Boolean(busyId)}
              onClick={() => deleteCandidate && handleDelete(deleteCandidate.id)}
            >
              <Trash2 className="h-4 w-4" />
              {busyId ? "กำลังลบ…" : "ยืนยันการลบถาวร"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
