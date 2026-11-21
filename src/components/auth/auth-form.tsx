"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2, LogIn, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CLASS_ROOMS,
  GRADE_LEVELS,
  formatClassroom,
} from "@/lib/constants/classroom";
import { cn } from "@/lib/utils";

interface AuthFormProps {
  nextUrl: string;
  initialTab?: "login" | "register";
  error?: string;
}

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  provider_cancelled: "ยกเลิกการเข้าสู่ระบบแล้ว",
  email_unverified: "อีเมลยังไม่ได้รับการยืนยันจากผู้ให้บริการ",
  oauth_failed: "ผู้ให้บริการไม่สามารถเข้าสู่ระบบได้ในขณะนี้",
};

function oauthErrorMessage(code?: string): string | null {
  if (!code) return null;
  return OAUTH_ERROR_MESSAGES[code] ?? "เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง";
}

function GoogleMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="size-4"
    >
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function GithubMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="size-4"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

export function AuthForm({
  nextUrl,
  initialTab = "login",
  error,
}: AuthFormProps) {
  const [tab, setTab] = useState<"login" | "register">(initialTab);

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // Sign up state (separate fields)
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [room, setRoom] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regLoading, setRegLoading] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const displayedError = errorMessage ?? oauthErrorMessage(error);

  const classroomPreview = formatClassroom(gradeLevel, room);
  const passwordMismatch =
    confirmPassword.length > 0 && regPassword !== confirmPassword;

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setLoginLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setErrorMessage(data.error ?? "เข้าสู่ระบบไม่สำเร็จ");
        return;
      }

      toast.success("เข้าสู่ระบบเรียบร้อยแล้ว");
      window.location.assign(nextUrl);
    } catch {
      setErrorMessage("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!firstName.trim() || !lastName.trim()) {
      setErrorMessage("กรุณากรอกชื่อและนามสกุลให้ครบถ้วน");
      return;
    }
    if (!nickname.trim()) {
      setErrorMessage("กรุณากรอกชื่อเล่น");
      return;
    }
    if (!gradeLevel) {
      setErrorMessage("กรุณาเลือกระดับชั้น (ม.1–ม.6)");
      return;
    }
    if (!room) {
      setErrorMessage("กรุณาเลือกห้องเรียน (1–14)");
      return;
    }
    if (regPassword.length < 8) {
      setErrorMessage("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }
    if (regPassword !== confirmPassword) {
      setErrorMessage("รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }

    setRegLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          nickname: nickname.trim(),
          gradeLevel,
          room,
          email: regEmail,
          password: regPassword,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        bootstrappedAdmin?: boolean;
      };

      if (!response.ok) {
        setErrorMessage(data.error ?? "สมัครสมาชิกไม่สำเร็จ");
        return;
      }

      if (data.bootstrappedAdmin) {
        toast.success(
          "สมัครสมาชิกสำเร็จ ระบบกำหนดบัญชีแรกเป็นผู้ดูแลระบบ (Admin) เรียบร้อย",
        );
        window.location.assign(nextUrl === "/" ? "/admin" : nextUrl);
      } else {
        toast.success("สมัครสมาชิกสำเร็จ ยินดีต้อนรับสู่ TechComp Hub!");
        window.location.assign(nextUrl === "/" ? "/profile" : nextUrl);
      }
    } catch {
      setErrorMessage("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setRegLoading(false);
    }
  }

  return (
    <div className="w-full space-y-5">
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value === "register" ? "register" : "login");
          setErrorMessage(null);
        }}
      >
        <TabsList
          variant="line"
          className="h-auto w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0 group-data-horizontal/tabs:h-auto"
        >
          <TabsTrigger
            value="login"
            className="flex-none rounded-none px-0 pb-2.5 text-sm font-medium after:bg-primary group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold"
          >
            เข้าสู่ระบบ
          </TabsTrigger>
          <TabsTrigger
            value="register"
            className="flex-none rounded-none px-0 pb-2.5 text-sm font-medium after:bg-primary group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold"
          >
            สมัครสมาชิก
          </TabsTrigger>
        </TabsList>

        {displayedError ? (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{displayedError}</AlertDescription>
          </Alert>
        ) : null}

        <TabsContent value="login" className="space-y-4 pt-5">
          <div className="grid grid-cols-1 gap-2.5">
            <a
              href="/api/auth/oauth/google/start"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-11 w-full gap-2 rounded-md",
              )}
            >
              <GoogleMark />
              ดำเนินการต่อด้วย Google
            </a>
            <a
              href="/api/auth/oauth/github/start"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-11 w-full gap-2 rounded-md",
              )}
            >
              <GithubMark />
              ดำเนินการต่อด้วย GitHub
            </a>
          </div>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="shrink-0 text-xs text-muted-foreground">หรือ</span>
            <Separator className="flex-1" />
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="login-email">อีเมล</Label>
              <Input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                placeholder="name@school.ac.th"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="h-10 rounded-md"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="login-password">รหัสผ่าน</Label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showLoginPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="กรอกรหัสผ่านของคุณ"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="h-10 rounded-md pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((prev) => !prev)}
                  aria-label={showLoginPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  {showLoginPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                ลืมรหัสผ่าน?
              </Link>
            </div>

            <Button
              type="submit"
              className="h-10 w-full gap-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={loginLoading}
            >
              {loginLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              เข้าสู่ระบบ
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              ยังไม่มีบัญชีในระบบ?{" "}
              <button
                type="button"
                onClick={() => {
                  setTab("register");
                  setErrorMessage(null);
                }}
                className="font-medium text-primary hover:underline"
              >
                สมัครสมาชิกใหม่
              </button>
            </p>
          </form>
        </TabsContent>

        <TabsContent value="register" className="pt-5">
          <form onSubmit={handleRegister} className="space-y-4">
            {/* Separate First Name & Last Name */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="reg-first-name">ชื่อ *</Label>
                <Input
                  id="reg-first-name"
                  required
                  autoComplete="given-name"
                  placeholder="เช่น กฤตเมธ"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="h-10 rounded-md"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reg-last-name">นามสกุล *</Label>
                <Input
                  id="reg-last-name"
                  required
                  autoComplete="family-name"
                  placeholder="เช่น ใจดี"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="h-10 rounded-md"
                />
              </div>
            </div>

            {/* Separate Nickname, Grade & Room (1-14) */}
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="reg-nickname">ชื่อเล่น *</Label>
                  <Input
                    id="reg-nickname"
                    required
                    placeholder="เช่น นนท์"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="h-10 rounded-md"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reg-grade-level">ชั้น *</Label>
                  <Select value={gradeLevel} onValueChange={setGradeLevel}>
                    <SelectTrigger
                      id="reg-grade-level"
                      className="h-10 w-full rounded-md"
                    >
                      <SelectValue placeholder="เลือกชั้น" />
                    </SelectTrigger>
                    <SelectContent>
                      {GRADE_LEVELS.map((level) => (
                        <SelectItem key={level} value={level}>
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reg-room">ห้อง (1–14) *</Label>
                  <Select value={room} onValueChange={setRoom}>
                    <SelectTrigger
                      id="reg-room"
                      className="h-10 w-full rounded-md"
                    >
                      <SelectValue placeholder="เลือกห้อง" />
                    </SelectTrigger>
                    <SelectContent>
                      {CLASS_ROOMS.map((num) => (
                        <SelectItem key={num} value={num}>
                          ห้อง {num}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {classroomPreview ? (
                <p className="text-xs text-muted-foreground">
                  ห้องเรียนที่เลือก:{" "}
                  <span className="font-mono font-medium text-foreground">
                    {classroomPreview}
                  </span>
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reg-email">อีเมล *</Label>
              <Input
                id="reg-email"
                type="email"
                required
                autoComplete="email"
                placeholder="name@school.ac.th"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                className="h-10 rounded-md"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="reg-password">รหัสผ่าน *</Label>
                <div className="relative">
                  <Input
                    id="reg-password"
                    type={showRegPassword ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="อย่างน้อย 8 ตัวอักษร"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="h-10 rounded-md pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword((prev) => !prev)}
                    aria-label={showRegPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showRegPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reg-confirm-password">ยืนยันรหัสผ่าน *</Label>
                <Input
                  id="reg-confirm-password"
                  type={showRegPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="กรอกรหัสผ่านอีกครั้ง"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-10 rounded-md"
                />
              </div>
            </div>

            {passwordMismatch ? (
              <p className="text-xs text-destructive">
                รหัสผ่านและยืนยันรหัสผ่านยังไม่ตรงกัน
              </p>
            ) : regPassword.length > 0 && regPassword.length < 8 ? (
              <p className="text-xs text-muted-foreground">
                ต้องมีอย่างน้อย 8 ตัวอักษร (ปัจจุบัน {regPassword.length}/8)
              </p>
            ) : null}

            <Button
              type="submit"
              className="h-10 w-full gap-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={regLoading}
            >
              {regLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              สร้างบัญชี
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              มีบัญชีอยู่แล้ว?{" "}
              <button
                type="button"
                onClick={() => {
                  setTab("login");
                  setErrorMessage(null);
                }}
                className="font-medium text-primary hover:underline"
              >
                เข้าสู่ระบบที่นี่
              </button>
            </p>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
