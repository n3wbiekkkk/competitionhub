import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacherUser } from "@/lib/auth/cookies";
import { withSystemDb } from "@/lib/db/pool";
import { writeAudit } from "@/lib/utils/audit";
import { getRequestIp } from "@/lib/utils/request-ip";
import { logError } from "@/lib/utils/logger";

const uuidSchema = z.string().uuid();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireTeacherUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "รหัสคำขอไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const rawToken = randomBytes(32).toString("base64url");
    const digest = createHash("sha256").update(rawToken).digest();

    const result = await withSystemDb(async (client) => {
      const requestRow = await client.query<{ user_id: string }>(
        `SELECT user_id FROM public.password_reset_requests
         WHERE id = $1::uuid AND status = 'pending' AND expires_at > now()
         LIMIT 1`,
        [id],
      );
      const target = requestRow.rows[0];
      if (!target) return null;

      await client.query(
        `INSERT INTO public.password_reset_tokens
           (user_id, token_hash, expires_at, created_by)
         VALUES ($1, $2, now() + interval '30 minutes', $3)`,
        [target.user_id, digest, auth.user.id],
      );
      await client.query(
        `UPDATE public.password_reset_requests
         SET status = 'resolved', resolved_at = now(), resolved_by = $2
         WHERE id = $1`,
        [id, auth.user.id],
      );
      return { token: rawToken };
    });

    if (!result) {
      return NextResponse.json(
        { error: "คำขอนี้หมดอายุหรือถูกดำเนินการแล้ว" },
        { status: 409 },
      );
    }

    const link = new URL("/reset-password", new URL(request.url).origin);
    link.searchParams.set("token", result.token);
    await writeAudit({
      actorId: auth.user.id,
      action: "admin.reset_link_issued",
      targetType: "password_reset_request",
      targetId: id,
      ipAddress: getRequestIp(request),
    });
    return NextResponse.json({ link: link.toString() });
  } catch (error) {
    logError("[api/admin/reset-requests] link failed", error);
    return NextResponse.json(
      { error: "ไม่สามารถสร้างลิงก์รีเซ็ตได้" },
      { status: 500 },
    );
  }
}
