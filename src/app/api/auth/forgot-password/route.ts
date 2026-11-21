import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withSystemDb } from "@/lib/db/pool";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { logError } from "@/lib/utils/logger";

const schema = z.object({
  email: z.string().trim().email("รูปแบบอีเมลไม่ถูกต้อง"),
});

const GENERIC_MESSAGE =
  "หากอีเมลนี้มีบัญชีในระบบ ระบบจะบันทึกคำขอรีเซ็ตรหัสผ่านให้อาจารย์ผู้ดูแลตรวจสอบ";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 200 });
  }

  const email = parsed.data.email.toLowerCase();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  const emailKey = sha256(email).slice(0, 32);

  if (!(await consumeRateLimit(`forgot:email:${emailKey}`, 3, 900_000)).allowed) {
    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
  }
  if (!(await consumeRateLimit(`forgot:ip:${ip}`, 20, 900_000)).allowed) {
    return NextResponse.json(
      { error: "ขอคำขอมากเกินไป กรุณารอสักครู่แล้วลองใหม่" },
      { status: 429 },
    );
  }

  try {
    await withSystemDb(async (client) => {
      await client.query("SELECT public.expire_password_reset_requests()");
      const account = await client.query<{ id: string }>(
        "SELECT id FROM public.auth_accounts WHERE lower(email) = lower($1) LIMIT 1",
        [email],
      );
      const userId = account.rows[0]?.id;
      if (!userId) return;

      await client.query(
        `INSERT INTO public.password_reset_requests (user_id, expires_at)
         SELECT $1, now() + interval '24 hours'
         WHERE NOT EXISTS (
           SELECT 1 FROM public.password_reset_requests
           WHERE user_id = $1 AND status = 'pending' AND expires_at > now()
         )`,
        [userId],
      );
    });
  } catch (error) {
    logError("[api/auth/forgot-password] failed", error);
  }

  return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
}
