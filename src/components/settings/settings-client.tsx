"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  Save,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import { useTheme, type ThemePreference } from "@/components/theme/theme-provider";
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
  const [liveProfile, setLiveProfile] = useState<Profile>(profile);

  const initialName = splitFullName(profile.full_name);
  const initialClass = parseClassroom(profile.grade);

  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [nickname, setNickname] = useState(profile.nickname ?? "");
  const [gradeLevel, setGradeLevel] = useState<string>(
    initialClass.gradeLevel,
  );
  const [room, setRoom] = useState<string>(initialClass.room);
  const [legacyGrade, setLegacyGrade] = useState<string>(
    initialClass.customGrade,
  );
  const [contact, setContact] = useState(profile.contact ?? "");
  const [savingAccount, setSavingAccount] = useState(false);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [loggingOut, setLoggingOut] = useState(false);

  const computedGrade =
    formatClassroom(gradeLevel, room) ?? (legacyGrade.trim() || null);

  async function handleSaveAccount(e: FormEvent) {
    e.preventDefault();
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
        body: JSON.stringify({
          full_name: fullName,
          nickname: nickname.trim() || null,
          grade: computedGrade,
          skills: liveProfile.skills,
          contact: contact.trim() || null,
          github_url: liveProfile.github_url,
          portfolio_url: liveProfile.portfolio_url,
        }),
      });
      const data = (await response.json()) as {
        profile?: Profile;
        error?: string;
      };
      if (!response.ok || !data.profile) {
        toast.error(data.error ?? "ไม่สามารถบันทึกการตั้งค่าได้");
        return;
      }

      setLiveProfile(data.profile);
      toast.success("บันทึกข้อมูลบัญชีและห้องเรียนเรียบร้อยแล้ว");
      router.refresh();
    } catch {
      toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setSavingAccount(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error("รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }

    setSavingPassword(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "ไม่สามารถเปลี่ยนรหัสผ่านได้");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      toast.success("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว");
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
      toast.success("ออกจากระบบเรียบร้อยแล้ว");
      router.push("/");
      router.refresh();
    } catch {
      toast.error("ไม่สามารถออกจากระบบได้");
    } finally {
      setLoggingOut(false);
    }
  }

  const themeOptions: Array<{
    id: ThemePreference;
    label: string;
    desc: string;
    icon: typeof Sun;
  }> = [
    { id: "light", label: "สว่าง", desc: "พื้นหลังสว่างอ่านง่าย", icon: Sun },
    { id: "dark", label: "มืด", desc: "ลดแสงจ้าในที่มืด", icon: Moon },
    {
      id: "system",
      label: "ตามระบบ",
      desc: "ปรับอัตโนมัติตามอุปกรณ์",
      icon: Monitor,
    },
  ];

  const createdDateStr = liveProfile.created_at
    ? liveProfile.created_at.slice(0, 10)
    : null;

  return (
    <div className="space-y-8">
      {/* Section 1: Account & Classroom */}
      <section className="grid gap-6 border-b border-border pb-8 lg:grid-cols-12">
        <div className="space-y-1.5 lg:col-span-4">
          <h2 className="text-sm font-semibold text-foreground">
            ข้อมูลบัญชีและห้องเรียน
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            แก้ไขชื่อ นามสกุล ชั้น และห้องเรียน (1–14) ได้ตลอดเวลา
          </p>
          <div className="pt-2">
            <Link
              href="/profile"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              จัดการทักษะและลิงก์ GitHub / Portfolio
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        <form onSubmit={handleSaveAccount} className="space-y-4 lg:col-span-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="settings-first-name">ชื่อ *</Label>
              <Input
                id="settings-first-name"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="rounded-md"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settings-last-name">นามสกุล</Label>
              <Input
                id="settings-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="rounded-md"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settings-nickname">ชื่อเล่น</Label>
              <Input
                id="settings-nickname"
                placeholder="เช่น นนท์"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="rounded-md"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settings-grade-level">ชั้น</Label>
              <Select
                value={gradeLevel || "none"}
                onValueChange={(value) => {
                  const next = value === "none" ? "" : value;
                  setGradeLevel(next);
                  if (next) setLegacyGrade("");
                  if (!next) setRoom("");
                }}
              >
                <SelectTrigger
                  id="settings-grade-level"
                  className="w-full rounded-md"
                >
                  <SelectValue placeholder="เลือกชั้น" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">ไม่ระบุชั้น</SelectItem>
                  {GRADE_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settings-room">ห้อง (1–14)</Label>
              <Select
                value={room || "none"}
                onValueChange={(value) => {
                  setRoom(value === "none" ? "" : value);
                }}
                disabled={!gradeLevel}
              >
                <SelectTrigger id="settings-room" className="w-full rounded-md">
                  <SelectValue placeholder="เลือกห้อง" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">ไม่ระบุห้อง</SelectItem>
                  {CLASS_ROOMS.map((num) => (
                    <SelectItem key={num} value={num}>
                      ห้อง {num}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!gradeLevel && legacyGrade ? (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="settings-legacy-grade">
                  ข้อมูลชั้น/แผนกเดิม
                </Label>
                <Input
                  id="settings-legacy-grade"
                  value={legacyGrade}
                  onChange={(e) => setLegacyGrade(e.target.value)}
                  className="rounded-md"
                />
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="settings-contact">
                ช่องทางติดต่อ (Discord / LINE ID)
              </Label>
              <Input
                id="settings-contact"
                placeholder="เช่น discord: dev_krit หรือ line: @krit"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                className="rounded-md"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settings-email">อีเมลบัญชี</Label>
              <Input
                id="settings-email"
                value={liveProfile.email}
                disabled
                className="rounded-md"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground">
              ค่าห้องเรียนที่บันทึก:{" "}
              <span className="font-mono font-medium text-foreground">
                {computedGrade ?? "ยังไม่ระบุ"}
              </span>
            </p>
            <Button
              type="submit"
              size="sm"
              disabled={savingAccount}
              className="gap-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {savingAccount ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              บันทึกข้อมูลบัญชี
            </Button>
          </div>
        </form>
      </section>

      {/* Section 2: Security / Change Password */}
      <section className="grid gap-6 border-b border-border pb-8 lg:grid-cols-12">
        <div className="space-y-1.5 lg:col-span-4">
          <h2 className="text-sm font-semibold text-foreground">
            ความปลอดภัยและรหัสผ่าน
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            เปลี่ยนรหัสผ่านเพื่อความปลอดภัย รหัสผ่านใหม่ต้องมีอย่างน้อย 8
            ตัวอักษร
          </p>
        </div>

        <form
          onSubmit={handleChangePassword}
          className="space-y-4 lg:col-span-8"
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="settings-current-pw">รหัสผ่านปัจจุบัน *</Label>
              <button
                type="button"
                onClick={() => setShowPasswords((prev) => !prev)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {showPasswords ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5" /> ซ่อนรหัสผ่าน
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" /> แสดงรหัสผ่าน
                  </>
                )}
              </button>
            </div>
            <Input
              id="settings-current-pw"
              type={showPasswords ? "text" : "password"}
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="rounded-md"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="settings-new-pw">รหัสผ่านใหม่ *</Label>
              <Input
                id="settings-new-pw"
                type={showPasswords ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="อย่างน้อย 8 ตัวอักษร"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="rounded-md"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settings-confirm-pw">ยืนยันรหัสผ่านใหม่ *</Label>
              <Input
                id="settings-confirm-pw"
                type={showPasswords ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className="rounded-md"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={savingPassword}
              className="gap-1.5 rounded-md"
            >
              {savingPassword ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              เปลี่ยนรหัสผ่าน
            </Button>
          </div>
        </form>
      </section>

      {/* Section 3: Appearance */}
      <section className="grid gap-6 border-b border-border pb-8 lg:grid-cols-12">
        <div className="space-y-1.5 lg:col-span-4">
          <h2 className="text-sm font-semibold text-foreground">
            การแสดงผล (Appearance)
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            เลือกธีมสีของระบบ ระบบจะจดจำค่าไว้ในเบราว์เซอร์นี้
          </p>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-3 lg:col-span-8">
          {themeOptions.map((opt) => {
            const Icon = opt.icon;
            const active = theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTheme(opt.id)}
                className={`flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-foreground hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-medium">
                  <Icon className="h-3.5 w-3.5" />
                  <span>{opt.label}</span>
                </div>
                <span
                  className={`text-[11px] ${
                    active ? "opacity-80" : "text-muted-foreground"
                  }`}
                >
                  {opt.desc}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Section 4: Session & Role */}
      <section className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-1.5 lg:col-span-4">
          <h2 className="text-sm font-semibold text-foreground">
            สิทธิ์การใช้งานและเซสชัน
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            สถานะบัญชีปัจจุบันและการออกจากระบบบนอุปกรณ์นี้
          </p>
        </div>

        <div className="space-y-4 lg:col-span-8">
          <dl className="divide-y divide-border border-y border-border text-sm">
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-muted-foreground">สิทธิ์ในระบบ</dt>
              <dd className="font-medium text-foreground">
                {USER_ROLE_LABELS_TH[liveProfile.role]}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-muted-foreground">วันที่สร้างบัญชี</dt>
              <dd className="tabular-nums text-foreground">
                {formatThaiDate(createdDateStr, "long")}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {liveProfile.role === "teacher" ? (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="gap-1.5 rounded-md"
              >
                <Link href="/admin">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  เปิด Admin Dashboard
                </Link>
              </Button>
            ) : (
              <span />
            )}

            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loggingOut}
              onClick={handleLogout}
              className="gap-1.5 rounded-md text-destructive hover:text-destructive"
            >
              {loggingOut ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LogOut className="h-3.5 w-3.5" />
              )}
              ออกจากระบบ
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
