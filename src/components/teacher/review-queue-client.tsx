"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
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
import { Checkbox } from "@/components/ui/checkbox";
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

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

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((itemId) => itemId !== id)
        : [...current, id],
    );
  }

  function duplicateMatches(item: ReviewCompetitionItem) {
    const title = item.title.trim().toLowerCase();
    const sourceUrl = item.source_url?.trim().toLowerCase();
    return competitions.filter((other) => {
      if (other.id === item.id) return false;
      const otherTitle = other.title.trim().toLowerCase();
      const otherUrl = other.source_url?.trim().toLowerCase();
      return (
        otherTitle === title || Boolean(sourceUrl && otherUrl === sourceUrl)
      );
    });
  }

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

  async function handleBulkStatusChange(
    nextStatus: CompetitionStatus,
    successMessage: string,
  ) {
    if (bulkBusy || visibleSelectedItems.length === 0) return;
    setBulkBusy(true);
    const results = await Promise.allSettled(
      visibleSelectedItems.map(async (item) => {
        const response = await fetch(`/api/competitions/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        });
        if (!response.ok) throw new Error("status update failed");
        const data = (await response.json()) as { competition?: Competition };
        if (!data.competition) throw new Error("missing competition");
        return item.id;
      }),
    );

    const succeededIds = new Set(
      results.flatMap((result, index) =>
        result.status === "fulfilled" ? [visibleSelectedItems[index].id] : [],
      ),
    );
    if (succeededIds.size > 0) {
      setCompetitions((current) =>
        current.map((item) =>
          succeededIds.has(item.id) ? { ...item, status: nextStatus } : item,
        ),
      );
      setSelectedIds((current) =>
        current.filter((id) => !succeededIds.has(id)),
      );
      toast.success(`${successMessage} (${succeededIds.size} รายการ)`);
      router.refresh();
    }
    if (succeededIds.size < results.length) {
      toast.error(`อัปเดตไม่สำเร็จ ${results.length - succeededIds.size} รายการ`);
    }
    setBulkBusy(false);
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

  const visibleSelectedItems = visibleItems.filter((item) =>
    selectedIds.includes(item.id),
  );
  const activeItem =
    visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null;
  const allVisibleSelected =
    visibleItems.length > 0 &&
    visibleItems.every((item) => selectedIds.includes(item.id));

  function toggleSelectAll() {
    const visibleIds = visibleItems.map((item) => item.id);
    setSelectedIds((current) =>
      visibleIds.every((id) => current.includes(id))
        ? current.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...current, ...visibleIds])),
    );
  }

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
            <>
              {visibleSelectedItems.length > 0 ? (
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-4 py-3">
                  <p className="text-sm font-medium tabular-nums text-foreground">
                    เลือกแล้ว {visibleSelectedItems.length} รายการ
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={bulkBusy}
                      onClick={() =>
                        handleBulkStatusChange(
                          "open",
                          "อนุมัติรายการแข่งขันขึ้นบอร์ดแล้ว",
                        )
                      }
                      className="h-11 gap-1.5 rounded-md text-xs sm:h-9"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      อนุมัติที่เลือก
                    </Button>
                    {activeTab === "pending_review" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={bulkBusy}
                        onClick={() =>
                          handleBulkStatusChange(
                            "rejected",
                            "ปฏิเสธรายการแข่งขันแล้ว",
                          )
                        }
                        className="h-11 gap-1.5 rounded-md text-xs text-destructive hover:text-destructive sm:h-9"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        ปฏิเสธที่เลือก
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={bulkBusy}
                      onClick={() => setSelectedIds([])}
                      className="h-11 rounded-md text-xs text-muted-foreground sm:h-9"
                    >
                      ยกเลิกการเลือก
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <div className="min-w-0 lg:col-span-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      รายการในแท็บนี้ ({visibleItems.length})
                    </p>
                    <label className="flex min-h-11 items-center gap-2 px-1 text-xs text-muted-foreground">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="เลือกรายการทั้งหมด"
                      />
                      เลือกทั้งหมด
                    </label>
                  </div>

                  <div className="max-h-[calc(100vh-18rem)] space-y-1.5 overflow-y-auto rounded-md border border-border p-1.5">
                    {visibleItems.map((item) => {
                      const isActive = activeItem?.id === item.id;
                      const duplicates = duplicateMatches(item);
                      return (
                        <div
                          key={item.id}
                          className={`flex items-start gap-2 rounded-md border px-1.5 py-1.5 transition-colors ${
                            isActive
                              ? "border-primary/50 bg-primary/5"
                              : "border-transparent hover:bg-muted/40"
                          }`}
                        >
                          <label className="flex h-11 w-11 shrink-0 items-center justify-center">
                            <Checkbox
                              checked={selectedIds.includes(item.id)}
                              onCheckedChange={() => toggleSelected(item.id)}
                              aria-label={`เลือก ${item.title}`}
                            />
                          </label>
                          <button
                            type="button"
                            aria-pressed={isActive}
                            onClick={() => setSelectedId(item.id)}
                            className="min-w-0 flex-1 py-1.5 text-left"
                          >
                            <p className="truncate text-sm font-medium text-foreground">
                              {item.title}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                              <span>
                                {TECH_CATEGORY_META[item.category].shortLabel}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">
                                {formatThaiDate(item.deadline, "short")}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">
                                สนใจ {item.interest_count}
                              </span>
                            </div>
                          </button>
                          <div className="flex shrink-0 flex-col items-end gap-0.5">
                            <Link
                              href={`/competitions/${item.id}`}
                              aria-label={item.title}
                              className="inline-flex h-11 items-center gap-1 px-1 text-xs font-medium text-primary hover:underline"
                            >
                              เปิด
                              <ExternalLink
                                className="h-3 w-3"
                                aria-hidden="true"
                              />
                            </Link>
                            {duplicates.length > 0 ? (
                              <span
                                aria-label="พบรายการที่อาจซ้ำกัน"
                                title="พบรายการที่อาจซ้ำกัน"
                                className="inline-flex items-center gap-1 text-[10px] text-destructive"
                              >
                                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                ซ้ำ {duplicates.length}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="min-w-0 lg:col-span-8">
                  <div className="lg:sticky lg:top-20">
                    {activeItem ? (
                      <section className="overflow-hidden rounded-md border border-border bg-background">
                        <header className="space-y-2 border-b border-border px-5 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground/80">
                              {TECH_CATEGORY_META[activeItem.category].labelTh}
                            </span>
                            <span
                              className={`rounded border px-2 py-0.5 font-medium ${
                                COMPETITION_STATUS_META[activeItem.status].badgeClassName
                              }`}
                            >
                              {COMPETITION_STATUS_META[activeItem.status].labelTh}
                            </span>
                          </div>
                          <h2 className="text-lg font-semibold tracking-tight text-foreground">
                            {activeItem.title}
                          </h2>
                          <p className="text-xs text-muted-foreground">
                            {getCompetitionSourceLabel(
                              activeItem.source_type,
                              activeItem.submitter_role,
                            )}
                            {activeItem.submitter_name
                              ? ` · โดย ${activeItem.submitter_name}`
                              : ""}
                          </p>
                        </header>

                        <div className="space-y-5 px-5 py-5">
                          {duplicateMatches(activeItem).length > 0 ? (
                            <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
                              <AlertTriangle
                                className="mt-0.5 h-4 w-4 shrink-0"
                                aria-hidden="true"
                              />
                              <div>
                                <p className="font-medium">
                                  พบรายการที่อาจซ้ำกัน
                                </p>
                                <p className="mt-0.5 leading-relaxed">
                                  มี {duplicateMatches(activeItem).length} รายการที่ใช้ชื่อหรือลิงก์ต้นทางเดียวกัน
                                  ควรตรวจสอบก่อนอนุมัติ
                                </p>
                              </div>
                            </div>
                          ) : null}

                          {editingId === activeItem.id && editDraft ? (
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
                                        Number(e.target.value) ||
                                          editDraft.min_size,
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
                          ) : (
                            <div className="space-y-3">
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span className="tabular-nums">
                                  ปิดรับ{" "}
                                  <strong className="font-medium text-foreground">
                                    {formatThaiDate(activeItem.deadline, "long")}
                                  </strong>
                                </span>
                                <span className="tabular-nums">
                                  สนใจ {activeItem.interest_count} คน · ทีม{" "}
                                  {activeItem.min_size}–{activeItem.max_size} คน
                                </span>
                                {activeItem.source_url ? (
                                  <a
                                    href={activeItem.source_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-primary hover:underline"
                                  >
                                    ต้นทาง
                                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                  </a>
                                ) : null}
                              </div>

                              {activeItem.summary ? (
                                <p className="text-sm leading-relaxed text-muted-foreground">
                                  {activeItem.summary}
                                </p>
                              ) : null}

                              {activeItem.eligibility ? (
                                <p className="text-xs text-muted-foreground">
                                  <strong className="font-medium text-foreground">
                                    คุณสมบัติ:
                                  </strong>{" "}
                                  {activeItem.eligibility}
                                </p>
                              ) : null}

                              {activeItem.recommended_roles.length > 0 ||
                              activeItem.tech_stack_hints.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5 pt-0.5">
                                  {activeItem.recommended_roles.map((role) => (
                                    <span
                                      key={role}
                                      className="rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground/80"
                                    >
                                      {role}
                                    </span>
                                  ))}
                                  {activeItem.tech_stack_hints.map((tech) => (
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
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                            {editingId === activeItem.id && editDraft ? (
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  disabled={busyId === activeItem.id}
                                  onClick={() => handleSaveEdit(activeItem.id)}
                                  className="h-11 gap-1.5 rounded-md text-xs sm:h-9"
                                >
                                  <Save className="h-3.5 w-3.5" />
                                  บันทึกการแก้ไข
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={cancelEdit}
                                  className="h-11 rounded-md text-xs sm:h-9"
                                >
                                  <X className="h-3.5 w-3.5" />
                                  ยกเลิก
                                </Button>
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => beginEdit(activeItem)}
                                  className="h-11 gap-1.5 rounded-md text-xs sm:h-9"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                  แก้ไขด่วน
                                </Button>

                                {activeItem.status !== "open" ? (
                                  <Button
                                    size="sm"
                                    disabled={busyId === activeItem.id}
                                    onClick={() =>
                                      handleStatusChange(
                                        activeItem.id,
                                        "open",
                                        "อนุมัติรายการแข่งขันขึ้นบอร์ดแล้ว",
                                      )
                                    }
                                    className="h-11 gap-1.5 rounded-md text-xs sm:h-9"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    อนุมัติขึ้นบอร์ด
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busyId === activeItem.id}
                                    onClick={() =>
                                      handleStatusChange(
                                        activeItem.id,
                                        "closed",
                                        "ปิดรับสมัครรายการนี้แล้ว",
                                      )
                                    }
                                    className="h-11 rounded-md text-xs sm:h-9"
                                  >
                                    ปิดรับสมัคร
                                  </Button>
                                )}

                                {activeItem.status === "pending_review" ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busyId === activeItem.id}
                                    className="h-11 gap-1.5 rounded-md text-xs text-destructive hover:text-destructive sm:h-9"
                                    onClick={() =>
                                      handleStatusChange(
                                        activeItem.id,
                                        "rejected",
                                        "ปฏิเสธรายการแข่งขันแล้ว",
                                      )
                                    }
                                  >
                                    <XCircle className="h-3.5 w-3.5" />
                                    ปฏิเสธ
                                  </Button>
                                ) : null}

                                {activeItem.status === "open" ||
                                activeItem.status === "closed" ? (
                                  <Button
                                    asChild
                                    size="sm"
                                    variant="outline"
                                    className="h-11 gap-1.5 rounded-md text-xs sm:h-9"
                                  >
                                    <Link
                                      href={`/teacher/competitions/${activeItem.id}/teams`}
                                    >
                                      <Users className="h-3.5 w-3.5" />
                                      จัดทีม ({activeItem.interest_count})
                                    </Link>
                                  </Button>
                                ) : null}
                              </div>
                            )}

                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busyId === activeItem.id}
                              className="h-11 gap-1.5 rounded-md text-xs text-muted-foreground hover:text-destructive sm:h-9"
                              onClick={() => setDeleteCandidate(activeItem)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              ลบ
                            </Button>
                          </div>
                        </div>
                      </section>
                    ) : null}
                  </div>
                </div>
              </div>
            </>
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
