import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/auth/cron";
import { sendMail } from "@/lib/email/mailer";
import { withSystemDb } from "@/lib/db/pool";
import { logError } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

interface OutboxRow {
  id: string;
  to_email: string;
  template: string;
  payload: { subject?: string; text?: string; html?: string };
  attempts: number;
}

async function handle(request: Request) {
  const cron = isAuthorizedCron(request);
  if (!cron.ok) {
    return NextResponse.json(
      { error: cron.misconfigured ? "CRON_SECRET not configured" : "Unauthorized" },
      { status: cron.misconfigured ? 500 : 401 },
    );
  }

  const batch = await withSystemDb(async (client) => {
    const result = await client.query<OutboxRow>(
      `select id, to_email, template, payload, attempts
       from public.email_outbox
       where status = 'pending' and scheduled_at <= now()
       order by scheduled_at asc
       limit 20
       for update skip locked`,
    );
    return result.rows;
  });

  let sent = 0;
  let failed = 0;
  for (const item of batch) {
    try {
      await sendMail({
        to: item.to_email,
        subject: item.payload.subject ?? `การแจ้งเตือนจาก TechComp Hub (${item.template})`,
        text: item.payload.text ?? "",
        html: item.payload.html ?? "",
      });
      await withSystemDb(async (client) => {
        await client.query(
          "update public.email_outbox set status = 'sent', sent_at = now() where id = $1",
          [item.id],
        );
      });
      sent += 1;
    } catch (error) {
      logError("[cron/email] delivery failed", error, { outboxId: item.id });
      await withSystemDb(async (client) => {
        await client.query(
          `update public.email_outbox
           set attempts = attempts + 1,
               status = case when attempts + 1 >= 3 then 'failed' else 'pending' end,
               scheduled_at = now() + interval '5 minutes'
           where id = $1`,
          [item.id],
        );
      });
      failed += 1;
    }
  }

  return NextResponse.json({ ok: true, processed: batch.length, sent, failed });
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
