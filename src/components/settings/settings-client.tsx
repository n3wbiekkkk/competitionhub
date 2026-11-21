"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  Save,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import { AccountSection } from "@/components/account/account-section";
import { Badge } from "@/components/ui/badge";
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
import { useTheme, type ThemePreference } from "@/components/theme/theme-provider";
import {
  CLASS_ROOMS,
  GRADE_LEVELS,
  formatClassroom,
  joinFullName,
  parseClassroom,
  splitFullName,
} from "@/lib/constants/classroom";
import { USER_ROLE_LABELS_TH } from "@/lib/constants/tech-taxonomy";
import { formatThaiDate } from "@/lib/utils/thai-date";
import type { Profile } from "@/types/database";

interface SettingsClientProps {
  profile: Profile;
}

export function SettingsClient({ profile }: SettingsClientProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [liveProfile, setLiveProfile] = useState(profile);

  const initialName = splitFullName(profile.full_name);
  const initialClass = parseClassroom(profile.grade);

  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [nickname, setNickname] = useState(profile.nickname ?? "");
  const [gradeLevel, setGradeLevel] = useState<string>(initialClass.gradeLevel);
  const [room, setRoom] = useState<string>(initialClass.room);
  const [legacyGrade, setLegacyGrade] = useState(initialClass.customGrade);
  const [savingAccount, setSavingAccount] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const computedGrade =
    formatClassroom(gradeLevel, room) ?? (legacyGrade.trim() || null);

  const accountDirty =
    joinFullName(firstName, lastName) !== profile.full_name ||
    nickname !== (profile.nickname ?? "") ||
    (computedGrade ?? "") !== (profile.grade ?? "");

  async function handleSaveAccount(event: FormEvent) {
    event.preventDefault();
    const fullName = joinFullName(firstName, lastName);
    if (fullName.length < 2) {
      toast.error("กรุณากรอกชื่อและนามสกุลให้ครบถ้วน");
      return;
    }
    setSavingAccount(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName, nickname: nickname.trim() || null, grade: computedGrade, skills: liveProfile.skills }),
      });
      const data = (await response.json()) as { profile?: Profile; error?: string };
      if (!response.ok || !data.profile) {
        toast.error(data.error ?? "ไม่สามารถบันทึกข้อมูลบัญชีได้");
        return;
      }
      setLiveProfile(data.profile);
      toast.success("บันทึกข้อมูลบัญชีแล้ว");
      router.refresh();
    } catch {
      toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setSavingAccount(false);
    }
  }

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 8) {
      toast.error("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error("รหัสผ่านไม่ตรงกัน");
      return;
    }
    setSavingPassword(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; message?: string };
      if (!response.ok) {
        toast.error(data.error ?? "ไม่สามารถเปลี่ยนรหัสผ่านได้");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      toast.success(data.message ?? "เปลี่ยนรหัสผ่านแล้ว");
    } catch {
      toast.error("เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน");
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
      toast.success("ออกจากระบบแล้ว");
      router.push("/");
      router.refresh();
    } catch {
      toast.error("ไม่สามารถออกจากระบบได้");
    } finally {
      setLoggingOut(false);
    }
  }

  const themeOptions: Array<{ id: ThemePreference; label: string; icon: typeof Sun }> = [
    { id: "light", label: "สว่าง", icon: Sun },
    { id: "dark", label: "มืด", icon: Moon },
    { id: "system", label: "ตามระบบ", icon: Monitor },
  ];

  return (
    <div className="space-y-10">
      <AccountSection
        id="account"
        title="ข้อมูลบัญชี"
        description="ใช้ชื่อและห้องเรียนที่ถูกต้อง เพื่อให้อาจารย์จัดทีมได้ตรงกัน"
        action={
          <Link href="/profile" className="text-xs font-medium text-primary hover:underline">
            จัดการโปรไฟล์
          </Link>
        }
      >
        <form onSubmit={handleSaveAccount} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ชื่อ *" id="settings-first-name">
              <Input id="settings-first-name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="rounded-lg" />
            </Field>
            <Field label="นามสกุล" id="settings-last-name">
              <Input id="settings-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} className="rounded-lg" />
            </Field>
            <Field label="ชื่อเล่น" id="settings-nickname">
              <Input id="settings-nickname" placeholder="เช่น นนท์" value={nickname} onChange={(e) => setNickname(e.target.value)} className="rounded-lg" />
            </Field>
            <Field label="ชั้น" id="settings-grade">
              <Select value={gradeLevel || "none"} onValueChange={(value) => { setGradeLevel(value === "none" ? "" : value); if (value) setLegacyGrade(""); if (!value) setRoom(""); }}>
                <SelectTrigger id="settings-grade" className="rounded-lg"><SelectValue placeholder="เลือกชั้น" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">ไม่ระบุชั้น</SelectItem>
                  {GRADE_LEVELS.map((level) => <SelectItem key={level} value={level}>{level}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="ห้อง (1–14)" id="settings-room">
              <Select value={room || "none"} onValueChange={(value) => setRoom(value === "none" ? "" : value)} disabled={!gradeLevel}>
                <SelectTrigger id="settings-room" className="rounded-lg"><SelectValue placeholder="เลือกห้อง" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">ไม่ระบุห้อง</SelectItem>
                  {CLASS_ROOMS.map((number) => <SelectItem key={number} value={number}>ห้อง {number}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="อีเมล" id="settings-email">
              <Input id="settings-email" value={liveProfile.email} disabled className="rounded-lg" />
            </Field>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              อีเมลใช้สำหรับเข้าสู่ระบบ และไม่แสดงในโปรไฟล์ที่ผู้อื่นเห็น
            </p>
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">{accountDirty ? "ยังไม่บันทึก" : "บันทึกแล้ว"}</span>
            <Button type="submit" disabled={savingAccount || !accountDirty} className="gap-2 rounded-lg bg-primary text-primary-foreground">
              {savingAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              บันทึกข้อมูลบัญชี
            </Button>
          </div>
        </form>
      </AccountSection>

      <AccountSection
        title="รหัสผ่าน"
        description="รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร หลังเปลี่ยน อุปกรณ์อื่นจะออกจากระบบ"
        action={<Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">ลืมรหัสผ่าน?</Link>}
      >
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="รหัสผ่านปัจจุบัน" id="settings-current-password">
              <Input id="settings-current-password" type={showPasswords ? "text" : "password"} required autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="rounded-lg" />
            </Field>
            <Field label="รหัสผ่านใหม่" id="settings-new-password">
              <Input id="settings-new-password" type={showPasswords ? "text" : "password"} required minLength={8} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="rounded-lg" />
            </Field>
            <Field label="ยืนยันรหัสผ่านใหม่" id="settings-confirm-password">
              <Input id="settings-confirm-password" type={showPasswords ? "text" : "password"} required minLength={8} autoComplete="new-password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} className="rounded-lg" />
            </Field>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowPasswords((prev) => !prev)} className="gap-2 text-muted-foreground">
              {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showPasswords ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
            </Button>
            <Button type="submit" disabled={savingPassword} className="gap-2 rounded-lg">
              {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              เปลี่ยนรหัสผ่าน
            </Button>
          </div>
        </form>
      </AccountSection>

      <AccountSection title="การแสดงผล" description="เลือกโหมดที่อ่านง่ายที่สุดสำหรับอุปกรณ์นี้">
        <div role="radiogroup" aria-label="โหมดสี" className="flex flex-wrap gap-2">
          {themeOptions.map((option) => {
            const Icon = option.icon;
            const active = theme === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(option.id)}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                  active
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {option.label}
              </button>
            );
          })}
        </div>
      </AccountSection>

      <AccountSection title="เซสชันและสิทธิ์" description="ตรวจสอบสิทธิ์ในระบบและออกจากระบบบนอุปกรณ์นี้">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">สิทธิ์ในระบบ</span>
              <Badge variant="secondary" className="rounded-md">{USER_ROLE_LABELS_TH[liveProfile.role]}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              สร้างบัญชีเมื่อ {formatThaiDate(liveProfile.created_at.slice(0, 10), "long")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {liveProfile.role === "teacher" ? (
              <Button asChild variant="outline" className="gap-2 rounded-lg">
                <Link href="/admin"><ShieldCheck className="h-4 w-4" />เปิดหน้าผู้ดูแลระบบ</Link>
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => void handleLogout()} disabled={loggingOut} className="gap-2 rounded-lg text-muted-foreground hover:text-destructive">
              <LogOut className="h-4 w-4" />ออกจากระบบ
            </Button>
          </div>
        </div>
      </AccountSection>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
