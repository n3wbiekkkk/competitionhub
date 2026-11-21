import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import { withSystemDb } from "@/lib/db/pool";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { logError } from "@/lib/utils/logger";

const schema = z.object({
  token: z.string().trim().min(20).max(200),
  password: z.string().min(8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร").max(128),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  if (!(await consumeRateLimit(`reset:ip:${ip}`, 10, 900_000)).allowed) {
    return NextResponse.json(
      { error: "ลองรีเซ็ตรหัสผ่านมากเกินไป กรุณารอสักครู่" },
      { status: 429 },
    );
  }

  try {
    const digest = createHash("sha256").update(parsed.data.token).digest();
    const nextHash = await hashPassword(parsed.data.password);

    const ok = await withSystemDb(async (client) => {
      const claimed = await client.query<{ user_id: string }>(
        `UPDATE public.password_reset_tokens
         SET used_at = now()
         WHERE token_hash = $1
           AND used_at IS NULL
           AND revoked_at IS NULL
           AND expires_at > now()
         RETURNING user_id`,
        [digest],
      );
      const userId = claimed.rows[0]?.user_id;
      if (!userId) return false;

      await client.query(
        `UPDATE public.password_reset_tokens
         SET revoked_at = now()
         WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
        [userId],
      );
      await client.query(
        "UPDATE public.auth_accounts SET password_hash = $1 WHERE id = $2",
        [nextHash, userId],
      );
      await client.query(
        `INSERT INTO public.auth_security (user_id, session_version)
         VALUES ($1, 1)
         ON CONFLICT (user_id)
         DO UPDATE SET session_version = public.auth_security.session_version + 1,
                       updated_at = now()`,
        [userId],
      );
      return true;
    });

    if (!ok) {
      return NextResponse.json(
        { error: "ลิงก์หมดอายุหรือถูกใช้แล้ว กรุณาขอลิงก์ใหม่" },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError("[api/auth/reset-password] failed", error);
    return NextResponse.json(
      { error: "ไม่สามารถตั้งรหัสผ่านใหม่ได้ในขณะนี้" },
      { status: 500 },
    );
  }
}
