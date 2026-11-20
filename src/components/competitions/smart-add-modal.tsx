"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  FileText,
  ImageUp,
  Link2,
  Loader2,
  PenLine,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { ExtractedCompetition } from "@/lib/ai/extract-competition";
import {
  TECH_CATEGORIES,
  TECH_CATEGORY_META,
  TECH_ROLES,
  type CompetitionSourceType,
  type TechCategory,
  type UserRole,
} from "@/lib/constants/tech-taxonomy";
import { formatThaiDate } from "@/lib/utils/thai-date";

interface SmartAddModalProps {
  userRole: UserRole;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCreated?: () => void;
}

type InputMode = "url" | "text" | "poster" | "manual";

interface ExtractApiSuccess {
  extracted: ExtractedCompetition;
  sourceType: CompetitionSourceType;
  sourceUrl: string | null;
}

export function SmartAddModal({
  userRole,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onCreated,
}: SmartAddModalProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  const [mode, setMode] = useState<InputMode>("url");
  const [urlInput, setUrlInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [textSourceUrl, setTextSourceUrl] = useState("");
  const [posterFile, setPosterFile] = useState<File | null>(null);

  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [blockedWallError, setBlockedWallError] = useState<string | null>(null);

  // Verification / form state
  const [hasFormReady, setHasFormReady] = useState(false);
  const [isTechRelated, setIsTechRelated] = useState(true);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [teacherOverride, setTeacherOverride] = useState(false);
  const [sourceType, setSourceType] =
    useState<CompetitionSourceType>("ai_link");

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TechCategory>(
    "Tech Hackathon & Innovation",
  );
  const [deadline, setDeadline] = useState("");
  const [minSize, setMinSize] = useState(1);
  const [maxSize, setMaxSize] = useState(4);
  const [recommendedRoles, setRecommendedRoles] = useState<string[]>([
    "Full-Stack",
  ]);
  const [techStackHints, setTechStackHints] = useState<string[]>([]);
  const [stackInput, setStackInput] = useState("");
  const [eligibility, setEligibility] = useState("");
  const [summary, setSummary] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const extractionRunRef = useRef(0);
  const extractionAbortRef = useRef<AbortController | null>(null);

  function cancelExtraction() {
    extractionRunRef.current += 1;
    extractionAbortRef.current?.abort();
    extractionAbortRef.current = null;
    setExtracting(false);
  }

  function resetAll() {
    setMode("url");
    setUrlInput("");
    setTextInput("");
    setTextSourceUrl("");
    setPosterFile(null);
    setExtracting(false);
    setExtractError(null);
    setBlockedWallError(null);
    setHasFormReady(false);
    setIsTechRelated(true);
    setRejectionReason(null);
    setTeacherOverride(false);
    setSourceType("ai_link");
    setTitle("");
    setCategory("Tech Hackathon & Innovation");
    setDeadline("");
    setMinSize(1);
    setMaxSize(4);
    setRecommendedRoles(["Full-Stack"]);
    setTechStackHints([]);
    setStackInput("");
    setEligibility("");
    setSummary("");
    setSourceUrl("");
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      cancelExtraction();
      resetAll();
    }
  }

  function populateFormFromExtracted(
    extracted: ExtractedCompetition,
    nextSourceType: CompetitionSourceType,
    nextSourceUrl: string | null,
  ) {
    if (!extracted.deadline) {
      toast.warning("AI ไม่แน่ใจวันปิดรับ กรุณาตรวจประกาศต้นทางก่อนบันทึก");
    }
    setIsTechRelated(extracted.is_tech_related);
    setRejectionReason(extracted.rejection_reason);
    setTeacherOverride(false);
    setSourceType(nextSourceType);
    setTitle(extracted.title);
    setCategory(extracted.category);
    setDeadline(extracted.deadline ?? "");
    setMinSize(extracted.min_size);
    setMaxSize(extracted.max_size);
    setRecommendedRoles(extracted.recommended_roles);
    setTechStackHints(extracted.tech_stack_hints);
    setEligibility(extracted.eligibility ?? "");
    setSummary(extracted.summary);
    setSourceUrl(nextSourceUrl ?? "");
    setHasFormReady(true);
  }

  function startManualEntry() {
    setMode("manual");
    setExtractError(null);
    setBlockedWallError(null);
    setIsTechRelated(true);
    setRejectionReason(null);
    setTeacherOverride(false);
    setSourceType("manual");
    setTitle("");
    setCategory("Tech Hackathon & Innovation");
    setDeadline("");
    setMinSize(1);
    setMaxSize(4);
    setRecommendedRoles(["Full-Stack"]);
    setTechStackHints([]);
    setEligibility("");
    setSummary("");
    setSourceUrl("");
    setHasFormReady(true);
  }

  async function handleExtract() {
    setExtractError(null);
    setBlockedWallError(null);
    cancelExtraction();
    const runId = extractionRunRef.current;
    const controller = new AbortController();
    extractionAbortRef.current = controller;
    const requestMode = mode;
    setExtracting(true);

    try {
      let response: Response;
      if (requestMode === "poster") {
        if (!posterFile) {
          setExtractError("กรุณาเลือกไฟล์ภาพโปสเตอร์ก่อนวิเคราะห์");
          setExtracting(false);
          return;
        }
        const formData = new FormData();
        formData.append("mode", "poster");
        formData.append("file", posterFile);
        response = await fetch("/api/ai/extract", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
      } else if (requestMode === "url") {
        response = await fetch("/api/ai/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "url", url: urlInput }),
          signal: controller.signal,
        });
      } else {
        response = await fetch("/api/ai/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "text",
            text: textInput,
            sourceUrl: textSourceUrl.trim() || null,
          }),
          signal: controller.signal,
        });
      }

      const data = (await response.json()) as Partial<ExtractApiSuccess> & {
        error?: string;
        code?: string;
      };

      if (runId !== extractionRunRef.current || controller.signal.aborted) return;

      if (!response.ok || !data.extracted) {
        if (data.code === "BLOCKED_WALL") {
          setBlockedWallError(
            data.error ??
              "ลิงก์นี้อาจติดหน้าเข้าสู่ระบบ กรุณาวางข้อความหรืออัปโหลดโปสเตอร์แทน",
          );
        } else {
          setExtractError(
            data.error ?? "ไม่สามารถสกัดข้อมูลได้ กรุณาลองใหม่อีกครั้ง",
          );
        }
        return;
      }

      populateFormFromExtracted(
        data.extracted,
        data.sourceType ?? "ai_link",
        data.sourceUrl ?? null,
      );
      toast.success("AI สกัดข้อมูลเรียบร้อย กรุณาตรวจสอบก่อนบันทึก");
    } catch {
      if (controller.signal.aborted) return;
      setExtractError("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      if (runId === extractionRunRef.current) setExtracting(false);
    }
  }

  function toggleRole(role: string) {
    setRecommendedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  function addStackHint() {
    const trimmed = stackInput.trim();
    if (!trimmed) return;
    if (!techStackHints.includes(trimmed)) {
      setTechStackHints((prev) => [...prev, trimmed].slice(0, 15));
    }
    setStackInput("");
  }

  function removeStackHint(tag: string) {
    setTechStackHints((prev) => prev.filter((item) => item !== tag));
  }

  async function handleSave() {
    if (!isTechRelated && userRole !== "teacher") {
      toast.error("ระบบเปิดรับเฉพาะการแข่งขันสายคอมพิวเตอร์และเทคโนโลยีเท่านั้น");
      return;
    }
    if (!isTechRelated && userRole === "teacher" && !teacherOverride) {
      toast.error("กรุณาเปิดสวิตช์ยืนยันสำหรับอาจารย์ก่อนบันทึก");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/competitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          category,
          deadline: deadline.trim() || null,
          min_size: minSize,
          max_size: Math.max(minSize, maxSize),
          recommended_roles: recommendedRoles,
          tech_stack_hints: techStackHints,
          eligibility: eligibility.trim() || null,
          summary,
          source_url: sourceUrl.trim() || null,
          source_type: sourceType,
          status: userRole === "teacher" ? "open" : "pending_review",
          is_tech_related: isTechRelated,
          teacher_override: teacherOverride,
        }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "ไม่สามารถบันทึกรายการแข่งขันได้");
        return;
      }

      toast.success(
        userRole === "teacher"
          ? "เพิ่มรายการแข่งขันขึ้นบอร์ดเรียบร้อยแล้ว"
          : "ส่งรายการแข่งขันให้ครูตรวจสอบแล้ว",
      );
      handleOpenChange(false);
      onCreated?.();
      router.refresh();
    } catch {
      toast.error("เกิดข้อผิดพลาดในการบันทึกรายการ");
    } finally {
      setSaving(false);
    }
  }

  const blockedSubmitByGatekeeper =
    !isTechRelated && (userRole !== "teacher" || !teacherOverride);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}

      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">
            เพิ่มรายการแข่งสาย Tech
          </DialogTitle>
          <DialogDescription>
            วางลิงก์ ข้อความประกาศ หรืออัปโหลดโปสเตอร์ ระบบจะคัดกรองเฉพาะงานสายคอมพิวเตอร์และเทคโนโลยีให้อัตโนมัติ
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={mode}
          onValueChange={(value) => {
            const next = value as InputMode;
            cancelExtraction();
            setHasFormReady(false);
            if (next === "manual") {
              startManualEntry();
            } else {
              setMode(next);
              setExtractError(null);
              setBlockedWallError(null);
            }
          }}
        >
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-4">
            <TabsTrigger value="url" className="gap-1.5 text-xs sm:text-sm">
              <Link2 className="h-3.5 w-3.5" />
              วางลิงก์
            </TabsTrigger>
            <TabsTrigger value="text" className="gap-1.5 text-xs sm:text-sm">
              <FileText className="h-3.5 w-3.5" />
              วางข้อความ
            </TabsTrigger>
            <TabsTrigger value="poster" className="gap-1.5 text-xs sm:text-sm">
              <ImageUp className="h-3.5 w-3.5" />
              อัปโหลดโปสเตอร์
            </TabsTrigger>
            {userRole === "teacher" ? (
              <TabsTrigger value="manual" className="gap-1.5 text-xs sm:text-sm">
                <PenLine className="h-3.5 w-3.5" />
                กรอกเอง
              </TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent value="url" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="smart-url">ลิงก์ประกาศการแข่งขัน</Label>
              <Input
                id="smart-url"
                type="url"
                placeholder="https://thailandhackathons.com/..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
              />
            </div>
            <Button
              type="button"
              onClick={handleExtract}
              disabled={extracting || !urlInput.trim()}
              className="w-full sm:w-auto"
            >
              {extracting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="mr-2 h-4 w-4" />
              )}
              {extracting ? "กำลังดึงข้อมูลและวิเคราะห์..." : "สกัดข้อมูลจากลิงก์"}
            </Button>
          </TabsContent>

          <TabsContent value="text" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="smart-text">
                ข้อความประกาศจาก Facebook / LINE / Discord
              </Label>
              <Textarea
                id="smart-text"
                rows={5}
                placeholder="วางรายละเอียดการแข่งขัน เช่น ชื่อรายการ วันปิดรับสมัคร คุณสมบัติ ขนาดทีม..."
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smart-text-url">ลิงก์ต้นทาง (ถ้ามี)</Label>
              <Input
                id="smart-text-url"
                type="url"
                placeholder="https://..."
                value={textSourceUrl}
                onChange={(e) => setTextSourceUrl(e.target.value)}
              />
            </div>
            <Button
              type="button"
              onClick={handleExtract}
              disabled={extracting || textInput.trim().length < 20}
            >
              {extracting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              {extracting ? "กำลังวิเคราะห์ข้อความ..." : "สกัดข้อมูลจากข้อความ"}
            </Button>
          </TabsContent>

          <TabsContent value="poster" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="smart-poster">
                ไฟล์ภาพโปสเตอร์ (JPG, PNG, WebP ไม่เกิน 8 MB)
              </Label>
              <Input
                id="smart-poster"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setPosterFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <Button
              type="button"
              onClick={handleExtract}
              disabled={extracting || !posterFile}
            >
              {extracting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ImageUp className="mr-2 h-4 w-4" />
              )}
              {extracting
                ? "กำลังอ่านข้อความจากภาพ..."
                : "อ่านโปสเตอร์และสกัดข้อมูล"}
            </Button>
          </TabsContent>
        </Tabs>

        {blockedWallError ? (
          <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" />
            <AlertTitle>ไม่สามารถดึงข้อมูลจากลิงก์ได้โดยตรง</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{blockedWallError}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTextSourceUrl(urlInput);
                    setMode("text");
                    setBlockedWallError(null);
                  }}
                >
                  เปลี่ยนไปวางข้อความแทน
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMode("poster");
                    setBlockedWallError(null);
                  }}
                >
                  อัปโหลดโปสเตอร์แทน
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}

        {extractError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>ไม่สามารถวิเคราะห์ข้อมูลได้</AlertTitle>
            <AlertDescription>{extractError}</AlertDescription>
          </Alert>
        ) : null}

        {hasFormReady ? (
          <div className="space-y-4 border-t pt-4">
            {!isTechRelated ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>รายการนี้อาจไม่ใช่สายคอมพิวเตอร์/เทคโนโลยี</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>{rejectionReason}</p>
                  {userRole === "teacher" ? (
                    <div className="flex items-center gap-2 pt-1">
                      <Switch
                        id="teacher-override"
                        checked={teacherOverride}
                        onCheckedChange={setTeacherOverride}
                      />
                      <Label
                        htmlFor="teacher-override"
                        className="text-xs font-medium cursor-pointer"
                      >
                        ยืนยันในฐานะอาจารย์: บันทึกรายการนี้แม้ AI แจ้งเตือน
                      </Label>
                    </div>
                  ) : (
                    <p className="text-xs font-medium">
                      นักเรียนไม่สามารถส่งรายการนอกสายคอมพิวเตอร์และเทคโนโลยีได้
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="comp-title">ชื่อรายการแข่งขัน *</Label>
                <Input
                  id="comp-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={!isTechRelated && userRole !== "teacher"}
                />
              </div>

              <div className="space-y-1.5">
                <Label>หมวดหมู่สาย Tech *</Label>
                <Select
                  value={category}
                  onValueChange={(value) => setCategory(value as TechCategory)}
                  disabled={!isTechRelated && userRole !== "teacher"}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TECH_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {TECH_CATEGORY_META[cat].labelTh} ({cat})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="comp-deadline">วันปิดรับสมัคร (ค.ศ.)</Label>
                <Input
                  id="comp-deadline"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  disabled={!isTechRelated && userRole !== "teacher"}
                />
                <p className="text-xs text-muted-foreground">
                  แสดงผลแบบไทย:{" "}
                  <span className="font-medium text-foreground">
                    {formatThaiDate(deadline || null, "long")}
                  </span>
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="comp-min-size">สมาชิกขั้นต่ำ (คน)</Label>
                <Input
                  id="comp-min-size"
                  type="number"
                  min={1}
                  max={20}
                  value={minSize}
                  onChange={(e) =>
                    setMinSize(Math.max(1, Number(e.target.value) || 1))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="comp-max-size">สมาชิกสูงสุด (คน)</Label>
                <Input
                  id="comp-max-size"
                  type="number"
                  min={minSize}
                  max={20}
                  value={maxSize}
                  onChange={(e) =>
                    setMaxSize(Math.max(minSize, Number(e.target.value) || minSize))
                  }
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>บทบาทที่แนะนำในทีม (Recommended Tech Roles)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {TECH_ROLES.map((role) => {
                    const selected = recommendedRoles.includes(role);
                    return (
                      <Button
                        key={role}
                        type="button"
                        size="sm"
                        variant={selected ? "default" : "outline"}
                        className="h-7 px-2.5 text-xs"
                        onClick={() => toggleRole(role)}
                      >
                        {selected ? <Check className="mr-1 h-3 w-3" /> : null}
                        {role}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>เทคโนโลยี / Tech Stack ที่เกี่ยวข้อง</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="เช่น Python, Next.js, ESP32 แล้วกดเพิ่ม"
                    value={stackInput}
                    onChange={(e) => setStackInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addStackHint();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={addStackHint}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {techStackHints.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {techStackHints.map((tag) => (
                      <Badge key={tag} variant="secondary" className="gap-1">
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeStackHint(tag)}
                          aria-label={`ลบ ${tag}`}
                          className="ml-0.5 rounded-full hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="comp-eligibility">คุณสมบัติผู้เข้าแข่งขัน</Label>
                <Input
                  id="comp-eligibility"
                  placeholder="เช่น นักเรียนระดับมัธยมศึกษาตอนปลาย หรือ นิสิต/นักศึกษา ป.ตรี"
                  value={eligibility}
                  onChange={(e) => setEligibility(e.target.value)}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="comp-source-url">ลิงก์รายละเอียดเพิ่มเติม</Label>
                <Input
                  id="comp-source-url"
                  type="url"
                  placeholder="https://..."
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="comp-summary">สรุปรายละเอียด *</Label>
                <Textarea
                  id="comp-summary"
                  rows={3}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                ยกเลิก
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={
                  saving ||
                  blockedSubmitByGatekeeper ||
                  title.trim().length < 3 ||
                  summary.trim().length < 5
                }
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {userRole === "teacher"
                  ? "เผยแพร่ขึ้นบอร์ดทันที"
                  : "ส่งรายการให้อาจารย์ตรวจสอบ"}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
