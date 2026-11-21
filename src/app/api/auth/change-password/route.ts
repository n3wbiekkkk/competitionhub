import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser, setSessionCookie } from "@/lib/auth/cookies";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { signSessionToken } from "@/lib/auth/session";
import { withSystemDb } from "@/lib/db/pool";
import { logError } from "@/lib/utils/logger";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "กรุณากรอกรหัสผ่านปัจจุบัน"),
    newPassword: z
      .string()
      .min(8, "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร")
      .max(128, "รหัสผ่านใหม่ยาวเกินไป"),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม",
    path: ["newPassword"],
  });

export async function POST(request: Request) {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "รูปแบบข้อมูลไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  const parsed = changePasswordSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  try {
    const outcome = await withSystemDb(async (client) => {
      const accountRes = await client.query<{ password_hash: string }>(
        "SELECT password_hash FROM public.auth_accounts WHERE id = $1 LIMIT 1",
        [auth.user.id],
      );
      const account = accountRes.rows[0];
      if (!account) {
        return { kind: "not_found" as const };
      }

      const validCurrent = await verifyPassword(
        parsed.data.currentPassword,
        account.password_hash,
      );
      if (!validCurrent) {
        return { kind: "wrong_password" as const };
      }

      const nextHash = await hashPassword(parsed.data.newPassword);
      await client.query(
        "UPDATE public.auth_accounts SET password_hash = $1 WHERE id = $2",
        [nextHash, auth.user.id],
      );

      const versionRes = await client.query<{ session_version: number }>(
        `INSERT INTO public.auth_security (user_id, session_version)
         VALUES ($1, 1)
         ON CONFLICT (user_id)
         DO UPDATE SET session_version = public.auth_security.session_version + 1,
                       updated_at = now()
         RETURNING session_version`,
        [auth.user.id],
      );

      return {
        kind: "updated" as const,
        sessionVersion: versionRes.rows[0]?.session_version ?? 1,
      };
    });

    if (outcome.kind === "not_found") {
      return NextResponse.json(
        { error: "ไม่พบบัญชีผู้ใช้ในระบบ" },
        { status: 404 },
      );
    }

    if (outcome.kind === "wrong_password") {
      return NextResponse.json(
        { error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" },
        { status: 400 },
      );
    }

    const response = NextResponse.json(
      {
        ok: true,
        message: "เปลี่ยนรหัสผ่านแล้ว อุปกรณ์อื่นจะถูกออกจากระบบ",
      },
      { status: 200 },
    );

    // Keep this device signed in with the new version; every other token dies.
    const token = await signSessionToken(
      {
        id: auth.user.id,
        email: auth.user.email,
        role: auth.user.role,
        fullName: auth.user.full_name,
      },
      outcome.sessionVersion,
    );
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    logError("[api/auth/change-password] error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถเปลี่ยนรหัสผ่านได้ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }
}
