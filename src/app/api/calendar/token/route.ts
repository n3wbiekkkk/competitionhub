import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth/cookies";
import { withUserDb } from "@/lib/db/pool";
import {
  buildHttpsFeedUrl,
  buildWebcalUrl,
  generateCalendarToken,
  hashCalendarToken,
} from "@/lib/integrations/calendar-token";
import { writeAudit } from "@/lib/utils/audit";
import { logError } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

interface TokenRow {
  created_at: string;
}

export async function GET() {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const row = await withUserDb(auth.user.id, async (client) => {
      const result = await client.query<TokenRow>(
        `select created_at::text from public.calendar_feed_tokens
         where user_id = $1 and revoked_at is null limit 1`,
        [auth.user.id],
      );
      return result.rows[0] ?? null;
    });
    return NextResponse.json({ active: Boolean(row), createdAt: row?.created_at ?? null });
  } catch (error) {
    logError("[api/calendar/token] GET error", error);
    return NextResponse.json(
      { error: "ไม่สามารถตรวจสอบสถานะฟีดปฏิทินได้" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const token = generateCalendarToken();
  const tokenHash = hashCalendarToken(token);

  try {
    const createdAt = await withUserDb(auth.user.id, async (client) => {
      const result = await client.query<{ created_at: string }>(
        `insert into public.calendar_feed_tokens (user_id, token_hash, created_at, revoked_at)
         values ($1, $2, now(), null)
         on conflict (user_id) do update
           set token_hash = excluded.token_hash,
               created_at = now(),
               revoked_at = null
         returning created_at::text`,
        [auth.user.id, tokenHash],
      );
      return result.rows[0]?.created_at ?? new Date().toISOString();
    });

    await writeAudit({
      actorId: auth.user.id,
      action: "calendar.feed_regenerate",
      targetType: "user",
      targetId: auth.user.id,
    });

    return NextResponse.json({
      token,
      createdAt,
      webcalUrl: buildWebcalUrl(request.url, token),
      httpsUrl: buildHttpsFeedUrl(request.url, token),
    });
  } catch (error) {
    logError("[api/calendar/token] POST error", error);
    return NextResponse.json(
      { error: "ไม่สามารถสร้างลิงก์ฟีดปฏิทินได้" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    await withUserDb(auth.user.id, async (client) => {
      await client.query(
        `update public.calendar_feed_tokens
         set revoked_at = now()
         where user_id = $1 and revoked_at is null`,
        [auth.user.id],
      );
    });

    await writeAudit({
      actorId: auth.user.id,
      action: "calendar.feed_revoke",
      targetType: "user",
      targetId: auth.user.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError("[api/calendar/token] DELETE error", error);
    return NextResponse.json(
      { error: "ไม่สามารถยกเลิกฟีดปฏิทินได้" },
      { status: 500 },
    );
  }
}
