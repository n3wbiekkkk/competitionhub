import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser } from "@/lib/auth/cookies";
import { withSystemDb } from "@/lib/db/pool";
import type { NotificationItem } from "@/types/database";

export async function GET() {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const notifications = await withSystemDb(async (client) => {
    const result = await client.query<NotificationItem>(
      `select id, kind, title, body, href, read_at::text, created_at::text
       from public.notifications
       where user_id = $1
       order by created_at desc
       limit 50`,
      [auth.user.id],
    );
    return result.rows;
  });
  return NextResponse.json({ notifications });
}

const patchSchema = z.object({
  id: z.string().uuid().optional(),
  all: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success || (!parsed.data.id && !parsed.data.all)) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  await withSystemDb(async (client) => {
    if (parsed.data.all) {
      await client.query(
        "update public.notifications set read_at = now() where user_id = $1 and read_at is null",
        [auth.user.id],
      );
    } else {
      await client.query(
        "update public.notifications set read_at = now() where user_id = $1 and id = $2",
        [auth.user.id, parsed.data.id],
      );
    }
  });
  return NextResponse.json({ ok: true });
}
