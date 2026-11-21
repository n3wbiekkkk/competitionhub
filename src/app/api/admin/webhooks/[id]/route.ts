import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacherUser } from "@/lib/auth/cookies";
import { withUserDb } from "@/lib/db/pool";
import {
  updateWebhookRouteSchema,
  validateWebhookTarget,
  type WebhookRouteItem,
} from "@/lib/integrations/webhooks";
import { writeAudit } from "@/lib/utils/audit";
import { logError } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();

export async function PATCH(
  request: Request,
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

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const parsed = updateWebhookRouteSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  let targetUrl: string | null = null;
  if (parsed.data.targetUrl !== undefined) {
    try {
      targetUrl = validateWebhookTarget(parsed.data.targetUrl);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "ลิงก์ปลายทางไม่ถูกต้อง" },
        { status: 400 },
      );
    }
  }

  try {
    const route = await withUserDb(auth.user.id, async (client) => {
      const result = await client.query<WebhookRouteItem>(
        `update public.webhook_routes
         set name = coalesce($2, name),
             target_url = coalesce($3, target_url),
             events = coalesce($4::text[], events),
             is_active = coalesce($5, is_active),
             updated_at = now()
         where id = $1
         returning id, name, target_url, events, is_active,
                   created_at::text, updated_at::text,
                   last_success_at::text, last_failure_at::text, 0 as delivery_count`,
        [
          id,
          parsed.data.name ?? null,
          targetUrl,
          parsed.data.events ?? null,
          parsed.data.isActive ?? null,
        ],
      );
      return result.rows[0] ?? null;
    });

    if (!route) {
      return NextResponse.json(
        { error: "ไม่พบปลายทางเว็บฮุก" },
        { status: 404 },
      );
    }

    await writeAudit({
      actorId: auth.user.id,
      action: "admin.webhook_update",
      targetType: "webhook_route",
      targetId: id,
      metadata: { isActive: route.is_active, events: route.events },
    });

    return NextResponse.json({ route });
  } catch (error) {
    logError("[api/admin/webhooks/[id]] PATCH error", error);
    return NextResponse.json(
      { error: "ไม่สามารถแก้ไขปลายทางเว็บฮุกได้" },
      { status: 500 },
    );
  }
}

export async function DELETE(
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
    const deleted = await withUserDb(auth.user.id, async (client) => {
      const result = await client.query("delete from public.webhook_routes where id = $1", [
        id,
      ]);
      return (result.rowCount ?? 0) > 0;
    });
    if (!deleted) {
      return NextResponse.json(
        { error: "ไม่พบปลายทางเว็บฮุก" },
        { status: 404 },
      );
    }

    await writeAudit({
      actorId: auth.user.id,
      action: "admin.webhook_delete",
      targetType: "webhook_route",
      targetId: id,
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    logError("[api/admin/webhooks/[id]] DELETE error", error);
    return NextResponse.json(
      { error: "ไม่สามารถลบปลายทางเว็บฮุกได้" },
      { status: 500 },
    );
  }
}
