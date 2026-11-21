import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/auth/cron";
import { withSystemDb } from "@/lib/db/pool";
import { getTodayIsoBangkok } from "@/lib/utils/thai-date";
import { formatThaiDate } from "@/lib/utils/thai-date";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const cron = isAuthorizedCron(request);
  if (!cron.ok) {
    return NextResponse.json(
      { error: cron.misconfigured ? "CRON_SECRET not configured" : "Unauthorized" },
      { status: cron.misconfigured ? 500 : 401 },
    );
  }

  const today = getTodayIsoBangkok();
  const result = await withSystemDb(async (client) => {
    const competitions = await client.query<{
      id: string;
      title: string;
      deadline: string;
    }>(
      `select id, title, deadline::text
       from public.competitions
       where status = 'open'
         and (deadline - $1::date) in (1, 3, 7)`,
      [today],
    );

    let created = 0;
    for (const competition of competitions.rows) {
      const days = Math.round(
        (Date.parse(`${competition.deadline}T00:00:00Z`) -
          Date.parse(`${today}T00:00:00Z`)) /
          86_400_000,
      );
      const users = await client.query<{ user_id: string }>(
        `select distinct user_id from (
           select user_id from public.interests where competition_id = $1
           union
           select user_id from public.competition_bookmarks where competition_id = $1
         ) u
         join public.notification_preferences p on p.user_id = u.user_id
         where p.deadline_reminders = true`,
        [competition.id],
      );
      for (const user of users.rows) {
        const dedupeKey = `deadline:${competition.id}:${days}`;
        const inserted = await client.query(
          `insert into public.notifications
             (user_id, kind, title, body, href, competition_id, dedupe_key)
           values ($1, 'deadline', $2, $3, $4, $5, $6)
           on conflict (user_id, dedupe_key) do nothing`,
          [
            user.user_id,
            `ใกล้ปิดรับ: ${competition.title}`,
            `ปิดรับ ${formatThaiDate(competition.deadline, "long")}`,
            `/competitions/${competition.id}`,
            competition.id,
            dedupeKey,
          ],
        );
        created += inserted.rowCount ?? 0;
      }
    }
    return { competitions: competitions.rows.length, created };
  });

  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
