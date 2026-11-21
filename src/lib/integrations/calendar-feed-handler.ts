import { NextResponse } from "next/server";
import { withSystemDb, withUserDb } from "@/lib/db/pool";
import { buildIcsCalendar } from "@/lib/integrations/calendar";
import { loadCalendarEvents } from "@/lib/integrations/calendar-feed";
import {
  hashCalendarToken,
  parseCalendarToken,
} from "@/lib/integrations/calendar-token";
import { logError } from "@/lib/utils/logger";

/**
 * Shared feed handler. `tokenFromPath` is used by a canonical dynamic route;
 * the literal `[token].ics` route passes the `feed` query parameter instead.
 */
export async function handleCalendarFeedRequest(
  request: Request,
  tokenFromPath?: string | null,
): Promise<Response> {
  const queryToken = new URL(request.url).searchParams.get("feed");
  const token = parseCalendarToken(tokenFromPath ?? queryToken ?? "");
  if (!token) {
    return NextResponse.json(
      { error: "ลิงก์ฟีดปฏิทินไม่ถูกต้อง" },
      { status: 404 },
    );
  }

  try {
    // The opaque token itself is the credential: no session is required.
    // Only its digest is used for this privileged lookup, and no user input
    // is executed as a privileged write.
    const userId = await withSystemDb(async (client) => {
      const result = await client.query<{ user_id: string }>(
        `select user_id::text from public.calendar_feed_tokens
         where token_hash = $1 and revoked_at is null limit 1`,
        [hashCalendarToken(token)],
      );
      return result.rows[0]?.user_id ?? null;
    });

    if (!userId) {
      return NextResponse.json(
        { error: "ฟีดปฏิทินนี้ถูกยกเลิกหรือไม่มีอยู่" },
        { status: 404 },
      );
    }

    const events = await withUserDb(userId, (client) =>
      loadCalendarEvents(client, userId, new URL(request.url).origin),
    );
    const body = buildIcsCalendar({ events, generatedAt: new Date() });

    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": 'inline; filename="techcomp-calendar.ics"',
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    logError("[api/calendar/feed] GET error", error);
    return NextResponse.json(
      { error: "ไม่สามารถสร้างฟีดปฏิทินได้" },
      { status: 500 },
    );
  }
}
