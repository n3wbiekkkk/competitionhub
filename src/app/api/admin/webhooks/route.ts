import { NextResponse } from "next/server";
import { requireTeacherUser } from "@/lib/auth/cookies";
import { withUserDb } from "@/lib/db/pool";
import {
  createWebhookRouteSchema,
  validateWebhookTarget,
  type WebhookRouteItem,
} from "@/lib/integrations/webhooks";
import { writeAudit } from "@/lib/utils/audit";
import { logError } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const routeSelect = `select wr.id, wr.name, wr.target_url, wr.events, wr.is_active,
       wr.created_at::text, wr.updated_at::text,
       wr.last_success_at::text, wr.last_failure_at::text,
       (select count(*)::int from public.webhook_deliveries d where d.route_id = wr.id) as delivery_count
 from public.webhook_routes wr`;

export async function GET() {
  const auth = await requireTeacherUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const routes = await withUserDb(auth.user.id, async (client) => {
      const result = await client.query<WebhookRouteItem>(
        `${routeSelect} order by wr.created_at desc`,
      );
      return result.rows;
    });
    return NextResponse.json({ routes });
  } catch (error) {
    logError("[api/admin/webhooks] GET error", error);
    return NextResponse.json(
      { error: "ไม่สามารถดึงรายการเว็บฮุกได้" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireTeacherUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const parsed = createWebhookRouteSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  let targetUrl: string;
  try {
    targetUrl = validateWebhookTarget(parsed.data.targetUrl);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ลิงก์ปลายทางไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  try {
    const route = await withUserDb(auth.user.id, async (client) => {
      const result = await client.query<WebhookRouteItem>(
        `insert into public.webhook_routes (name, target_url, events, is_active, created_by)
         values ($1, $2, $3::text[], $4, $5)
         returning id, name, target_url, events, is_active,
                   created_at::text, updated_at::text,
                   last_success_at::text, last_failure_at::text, 0 as delivery_count`,
        [
          parsed.data.name,
          targetUrl,
          parsed.data.events,
          parsed.data.isActive,
          auth.user.id,
        ],
      );
      return result.rows[0] ?? null;
    });

    await writeAudit({
      actorId: auth.user.id,
      action: "admin.webhook_create",
      targetType: "webhook_route",
      targetId: route?.id ?? null,
      metadata: { name: parsed.data.name, events: parsed.data.events },
    });

    return NextResponse.json({ route }, { status: 201 });
  } catch (error) {
    logError("[api/admin/webhooks] POST error", error);
    return NextResponse.json(
      { error: "ไม่สามารถสร้างปลายทางเว็บฮุกได้" },
      { status: 500 },
    );
  }
}
