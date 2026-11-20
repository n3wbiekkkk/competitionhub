"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
  Trash2,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { TECH_ROLES } from "@/lib/constants/tech-taxonomy";
import type { Interest } from "@/types/database";

interface InterestDrawerProps {
  competitionId: string;
  competitionTitle: string;
  recommendedRoles: string[];
  userSkills: string[];
  existingInterest: Interest | null;
  isOpen: boolean;
}

export function InterestDrawer({
  competitionId,
  competitionTitle,
  recommendedRoles,
  userSkills,
  existingInterest,
  isOpen,
}: InterestDrawerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const defaultRole =
    existingInterest?.preferred_role ||
    recommendedRoles[0] ||
    TECH_ROLES[0];

  const [preferredRole, setPreferredRole] = useState(defaultRole);
  const [note, setNote] = useState(existingInterest?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const otherRoles = TECH_ROLES.filter(
    (role) => !recommendedRoles.includes(role),
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/interest`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preferred_role: preferredRole,
            note: note.trim() || null,
          }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "ไม่สามารถบันทึกการลงชื่อได้");
        return;
      }

      toast.success(
        existingInterest
          ? "อัปเดตข้อมูลความสนใจแข่งขันแล้ว"
          : "ลงชื่อสนใจแข่งขันเรียบร้อย! รออาจารย์จัดทีมในระบบ",
      );
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setSaving(false);
    }
  }

  async function handleWithdraw() {
    setRemoving(true);
    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/interest`,
        { method: "DELETE" },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "ไม่สามารถยกเลิกการลงชื่อได้");
        return;
      }

      toast.success("ยกเลิกการลงชื่อรายการนี้แล้ว");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("เกิดข้อผิดพลาดในการยกเลิกการลงชื่อ");
    } finally {
      setRemoving(false);
    }
  }

  if (!isOpen) {
    return (
      <Button disabled variant="secondary" size="lg">
        ปิดรับสมัครแล้ว
      </Button>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="lg" className="gap-2">
          {existingInterest ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              แก้ไขการลงชื่อ ({existingInterest.preferred_role})
            </>
          ) : (
            <>
              <UserCheck className="h-4 w-4" />
              ลงชื่อสนใจแข่ง
            </>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>ลงชื่อสนใจเข้าร่วมการแข่งขัน</SheetTitle>
          <SheetDescription className="line-clamp-2">
            {competitionTitle}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold">ทักษะจากโปรไฟล์ของคุณ</p>
              <Link
                href="/profile"
                className="text-xs text-primary hover:underline"
              >
                แก้ไขทักษะ
              </Link>
            </div>
            {userSkills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {userSkills.map((skill) => (
                  <Badge
                    key={skill}
                    variant="secondary"
                    className="font-mono text-[11px]"
                  >
                    {skill}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                ยังไม่ได้เพิ่มทักษะในโปรไฟล์ แนะนำให้ไปเพิ่มทักษะเพื่อช่วยอาจารย์เลือกเข้าทีมได้ง่ายขึ้น
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>บทบาทหลักที่คุณอยากทำในทีม *</Label>
            <Select value={preferredRole} onValueChange={setPreferredRole}>
            <SelectTrigger aria-label="เลือกบทบาทในทีม">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {recommendedRoles.length > 0 ? (
                  <SelectGroup>
                    <SelectLabel>ตำแหน่งที่รายการนี้แนะนำ</SelectLabel>
                    {recommendedRoles.map((role) => (
                      <SelectItem key={`rec-${role}`} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
                <SelectGroup>
                  <SelectLabel>บทบาทสาย Tech อื่นๆ</SelectLabel>
                  {otherRoles.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="interest-note">
              ประสบการณ์ / โปรเจกต์ที่เกี่ยวข้อง (แจ้งอาจารย์)
            </Label>
            <Textarea
              id="interest-note"
              rows={4}
              placeholder="เช่น เคยทำเว็บ Next.js + PostgreSQL, เคยแข่ง CTF หรืองานหุ่นยนต์ Arduino มาก่อน"
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button type="submit" disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {existingInterest
                ? "บันทึกการแก้ไขความสนใจ"
                : "ยืนยันลงชื่อสนใจแข่ง"}
            </Button>

            {existingInterest ? (
              <Button
                type="button"
                variant="outline"
                disabled={removing}
                onClick={handleWithdraw}
                className="w-full gap-2 text-destructive hover:text-destructive"
              >
                {removing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                ยกเลิกการลงชื่อ
              </Button>
            ) : null}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
