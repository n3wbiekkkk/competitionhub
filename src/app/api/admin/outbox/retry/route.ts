import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacherUser } from "@/lib/auth/cookies";
import { withSystemDb } from "@/lib/db/pool";
import { writeAudit } from "@/lib/utils/audit";

const schema = z.object({ id: z.string().uuid() });

export async function POST(request: Request) {
  const auth = await requireTeacherUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "รหัสอีเมลไม่ถูกต้อง" }, { status: 400 });
  }

  const ok = await withSystemDb(async (client) => {
    const result = await client.query(
      `update public.email_outbox
       set status = 'pending', attempts = 0, scheduled_at = now(), last_error = null
       where id = $1 and status <> 'sent'`,
      [parsed.data.id],
    );
    return (result.rowCount ?? 0) > 0;
  });
  if (!ok) {
    return NextResponse.json({ error: "ไม่พบงานที่รออยู่" }, { status: 404 });
  }

  await writeAudit({
    actorId: auth.user.id,
    action: "admin.outbox_retry",
    targetType: "email_outbox",
    targetId: parsed.data.id,
  });
  return NextResponse.json({ ok: true });
}
