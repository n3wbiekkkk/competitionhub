import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacherUser } from "@/lib/auth/cookies";
import { withUserDb } from "@/lib/db/pool";
import {
  deliverWebhook,
  getWebhookSigningSecret,
  TEST_WEBHOOK_EVENT,
  validateWebhookTarget,
  type WebhookDeliveryItem,
  type WebhookRouteItem,
} from "@/lib/integrations/webhooks";
import { logError } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireTeacherUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "รหัสปลายทางไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const route = await withUserDb(auth.user.id, async (client) => {
      const result = await client.query<WebhookRouteItem>(
        `select id, name, target_url, events, is_active, created_at::text,
                updated_at::text, last_success_at::text, last_failure_at::text
         from public.webhook_routes where id = $1 limit 1`,
        [id],
      );
      return result.rows[0] ?? null;
    });

    if (!route) {
      return NextResponse.json(
        { error: "ไม่พบปลายทางเว็บฮุก" },
        { status: 404 },
      );
    }
    if (!route.is_active) {
      return NextResponse.json(
        { error: "ปลายทางนี้ถูกระงับการใช้งาน" },
        { status: 400 },
      );
    }

    try {
      validateWebhookTarget(route.target_url);
      getWebhookSigningSecret();
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "การตั้งค่าเว็บฮุกไม่สมบูรณ์" },
        { status: 400 },
      );
    }

    const outcome = await withUserDb(auth.user.id, async (client) =>
      deliverWebhook({
        client,
        route,
        event: TEST_WEBHOOK_EVENT,
        data: { mode: "test", requested_by: auth.user.id },
      }),
    );

    const deliveries = await withUserDb(auth.user.id, async (client) => {
      const result = await client.query<WebhookDeliveryItem>(
        `select id, route_id, event_type, status, http_status, error, created_at::text
         from public.webhook_deliveries where route_id = $1
         order by created_at desc limit 1`,
        [id],
      );
      return result.rows[0] ?? null;
    });

    return NextResponse.json({ outcome, delivery: deliveries });
  } catch (error) {
    logError("[api/admin/webhooks/[id]/test] POST error", error);
    return NextResponse.json(
      { error: "ไม่สามารถทดสอบส่งเว็บฮุกได้" },
      { status: 500 },
    );
  }
}
