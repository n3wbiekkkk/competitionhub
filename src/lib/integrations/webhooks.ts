import { createHmac, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { logError } from "@/lib/utils/logger";
import { validatePublicHttpUrl } from "@/lib/utils/url-safety";
import {
  WEBHOOK_EVENTS,
  type WebhookDeliveryItem,
  type WebhookEvent,
  type WebhookRouteItem,
} from "./webhook-events";

export {
  TEST_WEBHOOK_EVENT,
  WEBHOOK_EVENTS,
  type WebhookDeliveryItem,
  type WebhookRouteItem,
} from "./webhook-events";

export const webhookEventSchema = z.enum(WEBHOOK_EVENTS);
export type { WebhookEvent };

export const createWebhookRouteSchema = z.object({
  name: z.string().trim().min(1, "กรุณากรอกชื่อปลายทาง").max(80),
  targetUrl: z.string().trim().min(1).max(2048, "ลิงก์ปลายทางยาวเกินไป"),
  events: z.array(webhookEventSchema).min(1, "เลือกเหตุการณ์อย่างน้อย 1 รายการ").max(10),
  isActive: z.boolean().default(true),
});

export const updateWebhookRouteSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  targetUrl: z.string().trim().min(1).max(2048).optional(),
  events: z.array(webhookEventSchema).min(1).max(10).optional(),
  isActive: z.boolean().optional(),
});

export interface WebhookPayload {
  id: string;
  event: string;
  created_at: string;
  data: Record<string, unknown>;
}

export interface WebhookDeliveryOutcome {
  status: "sent" | "failed";
  httpStatus: number | null;
  error: string | null;
}

/**
 * Applies the shared SSRF guard again at send time. Re-validating stored URLs
 * matters because a route may be edited or the DNS policy may change later.
 */
export function validateWebhookTarget(rawUrl: string): string {
  const url = validatePublicHttpUrl(rawUrl);
  if (url.hash) {
    throw new Error("ไม่อนุญาตให้ระบุ fragment ในลิงก์ปลายทาง");
  }
  return url.toString();
}

export function buildWebhookPayload({
  event,
  data,
  id = randomUUID(),
  occurredAt = new Date(),
}: {
  event: string;
  data: Record<string, unknown>;
  id?: string;
  occurredAt?: Date;
}): WebhookPayload {
  return { id, event, created_at: occurredAt.toISOString(), data };
}

/** Signing key is supplied only by the server environment, never by source. */
export function getWebhookSigningSecret(): string {
  const secret = process.env.WEBHOOK_SIGNING_SECRET?.trim() ?? "";
  if (secret.length < 16) {
    throw new Error("ยังไม่ได้ตั้งค่า WEBHOOK_SIGNING_SECRET บนเซิร์ฟเวอร์");
  }
  return secret;
}

export function signWebhookPayload(secret: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError") {
    return "ปลายทางไม่ตอบสนองภายในเวลาที่กำหนด";
  }
  return "ไม่สามารถเชื่อมต่อปลายทางเว็บฮุกได้";
}

export async function sendWebhook({
  targetUrl,
  payload,
}: {
  targetUrl: string;
  payload: WebhookPayload;
}): Promise<WebhookDeliveryOutcome> {
  const url = validateWebhookTarget(targetUrl);
  const secret = getWebhookSigningSecret();
  const rawBody = JSON.stringify(payload);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "user-agent": "TechCompHub-Webhook/1.0",
        "x-techcomp-event": payload.event,
        "x-techcomp-signature": signWebhookPayload(secret, rawBody),
      },
      body: rawBody,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return {
        status: "failed",
        httpStatus: response.status,
        error: `ปลายทางตอบกลับ HTTP ${response.status}`,
      };
    }
    return { status: "sent", httpStatus: response.status, error: null };
  } catch (error) {
    logError("[webhook] delivery failed", error);
    return { status: "failed", httpStatus: null, error: safeErrorMessage(error) };
  }
}

export async function recordWebhookDelivery(
  client: PoolClient,
  {
    routeId,
    event,
    outcome,
  }: {
    routeId: string;
    event: string;
    outcome: WebhookDeliveryOutcome;
  },
): Promise<WebhookDeliveryItem | null> {
  const result = await client.query<WebhookDeliveryItem>(
    `insert into public.webhook_deliveries
       (route_id, event_type, status, http_status, error)
     values ($1, $2, $3, $4, $5)
     returning id, route_id, event_type, status, http_status, error, created_at::text`,
    [routeId, event, outcome.status, outcome.httpStatus, outcome.error],
  );

  await client.query(
    `update public.webhook_routes
     set ${outcome.status === "sent" ? "last_success_at = now()" : "last_failure_at = now()"},
         updated_at = now()
     where id = $1`,
    [routeId],
  );

  return result.rows[0] ?? null;
}

/** Sends one event to one route and always records the observed outcome. */
export async function deliverWebhook({
  client,
  route,
  event,
  data,
}: {
  client: PoolClient;
  route: WebhookRouteItem;
  event: string;
  data: Record<string, unknown>;
}): Promise<WebhookDeliveryOutcome> {
  const payload = buildWebhookPayload({ event, data });
  const outcome = await sendWebhook({ targetUrl: route.target_url, payload });
  await recordWebhookDelivery(client, { routeId: route.id, event, outcome });
  return outcome;
}

/** Fan-out used by privileged event producers (cron / teacher actions). */
export async function dispatchWebhookEvent({
  client,
  event,
  data,
}: {
  client: PoolClient;
  event: WebhookEvent;
  data: Record<string, unknown>;
}): Promise<number> {
  getWebhookSigningSecret();
  const routes = await client.query<WebhookRouteItem>(
    `select id, name, target_url, events, is_active, created_at::text,
            updated_at::text, last_success_at::text, last_failure_at::text
     from public.webhook_routes
     where is_active and $1 = any(events)`,
    [event],
  );

  let delivered = 0;
  for (const route of routes.rows) {
    try {
      const outcome = await deliverWebhook({ client, route, event, data });
      if (outcome.status === "sent") delivered += 1;
    } catch (error) {
      logError(`[webhook] route ${route.id} could not be dispatched`, error);
      await recordWebhookDelivery(client, {
        routeId: route.id,
        event,
        outcome: {
          status: "failed",
          httpStatus: null,
          error: "ไม่สามารถเตรียมส่งเว็บฮุกได้",
        },
      });
    }
  }
  return delivered;
}
