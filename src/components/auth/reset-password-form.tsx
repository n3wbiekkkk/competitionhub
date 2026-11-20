"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      toast.error("ลิงก์ไม่ถูกต้อง กรุณาขอลิงก์ใหม่");
      return;
    }
    if (password !== confirm) {
      toast.error("รหัสผ่านไม่ตรงกัน");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "ไม่สามารถตั้งรหัสผ่านใหม่ได้");
        return;
      }
      toast.success("ตั้งรหัสผ่านใหม่แล้ว กรุณาเข้าสู่ระบบ");
      router.push("/login");
    } catch {
      toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-widest text-primary">
          กู้คืนบัญชี
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          ตั้งรหัสผ่านใหม่
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          ลิงก์นี้ใช้ได้ครั้งเดียวและหมดอายุภายใน 30 นาที
        </p>
      </div>

      {!token ? (
        <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive">
          ลิงก์หมดอายุ กรุณาขอส่งลิงก์ใหม่
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="reset-password">รหัสผ่านใหม่</Label>
          <Input id="reset-password" type={show ? "text" : "password"} required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reset-confirm">ยืนยันรหัสผ่านใหม่</Label>
          <Input id="reset-confirm" type={show ? "text" : "password"} required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-11 rounded-lg" />
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setShow((prev) => !prev)} className="gap-2 text-muted-foreground">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
        </Button>
        <Button type="submit" disabled={loading || !token} className="h-11 w-full gap-2 rounded-lg bg-primary text-primary-foreground">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          ตั้งรหัสผ่านใหม่
        </Button>
      </form>
    </div>
  );
}
