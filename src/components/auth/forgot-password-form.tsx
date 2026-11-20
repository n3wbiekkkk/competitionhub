"use client";

import { useState, type FormEvent } from "react";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as { message?: string; error?: string };
      setMessage(data.message ?? data.error ?? "ส่งคำขอแล้ว");
    } catch {
      setMessage("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
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
          รีเซ็ตรหัสผ่าน
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          กรอกอีเมลที่ใช้สมัคร ระบบจะบันทึกคำขอให้อาจารย์ผู้ดูแลตรวจสอบและออกลิงก์รีเซ็ตให้
        </p>
      </div>

      {message ? (
        <p role="status" className="rounded-xl border border-primary/20 bg-sage px-4 py-3 text-sm text-sage-foreground">
          {message}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="forgot-email">อีเมล</Label>
          <Input
            id="forgot-email"
            type="email"
            required
            autoComplete="email"
            placeholder="name@school.ac.th"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-11 rounded-lg"
          />
        </div>
        <Button type="submit" disabled={loading || !email.trim()} className="h-11 w-full gap-2 rounded-lg bg-primary text-primary-foreground">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          ส่งลิงก์รีเซ็ตรหัสผ่าน
        </Button>
      </form>

      <Button asChild variant="ghost" className="gap-2 text-muted-foreground">
        <Link href="/login"><ArrowLeft className="h-4 w-4" />กลับไปเข้าสู่ระบบ</Link>
      </Button>
    </div>
  );
}
