/** Client-safe webhook vocabulary. Keep in sync with migration 0013 CHECKs. */
export const WEBHOOK_EVENTS = [
  "result.verified",
  "team.confirmed",
  "competition.opened",
] as const;

export const TEST_WEBHOOK_EVENT = "webhook.test" as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_LABELS_TH: Record<WebhookEvent, string> = {
  "result.verified": "ผลการแข่งขันได้รับการตรวจสอบ",
  "team.confirmed": "ทีมได้รับการยืนยัน",
  "competition.opened": "เปิดรับสมัครการแข่งขัน",
};

export interface WebhookRouteItem {
  id: string;
  name: string;
  target_url: string;
  events: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_success_at: string | null;
  last_failure_at: string | null;
  delivery_count?: number;
}

export interface WebhookDeliveryItem {
  id: string;
  route_id: string;
  event_type: string;
  status: "sent" | "failed";
  http_status: number | null;
  error: string | null;
  created_at: string;
}
