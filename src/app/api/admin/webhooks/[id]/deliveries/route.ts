import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacherUser } from "@/lib/auth/cookies";
import { withUserDb } from "@/lib/db/pool";
import type { WebhookDeliveryItem } from "@/lib/integrations/webhooks";
import { logError } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();

export async function GET(
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
    const deliveries = await withUserDb(auth.user.id, async (client) => {
      const result = await client.query<WebhookDeliveryItem>(
        `select id, route_id, event_type, status, http_status, error, created_at::text
         from public.webhook_deliveries
         where route_id = $1
         order by created_at desc
         limit 30`,
        [id],
      );
      return result.rows;
    });
    return NextResponse.json({ deliveries });
  } catch (error) {
    logError("[api/admin/webhooks/[id]/deliveries] GET error", error);
    return NextResponse.json(
      { error: "ไม่สามารถดึงประวัติการส่งได้" },
      { status: 500 },
    );
  }
}
