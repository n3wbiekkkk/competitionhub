import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

const calendarTokenSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{32,128}$/, "รหัสฟีดปฏิทินไม่ถูกต้อง");

/** Opaque bearer token. Only its SHA-256 digest is persisted. */
export function generateCalendarToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashCalendarToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function parseCalendarToken(raw: string): string | null {
  const parsed = calendarTokenSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Builds the webcal:// URL from the request origin, never from proxy headers. */
export function buildWebcalUrl(requestUrl: string, token: string): string {
  return buildHttpsFeedUrl(requestUrl, token).replace(/^https?:/, "webcal:");
}

export function buildHttpsFeedUrl(requestUrl: string, token: string): string {
  const url = new URL(requestUrl);
  return `${url.origin}/api/calendar/feed/${encodeURIComponent(token)}.ics`;
}
