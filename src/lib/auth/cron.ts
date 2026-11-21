import { createHash, timingSafeEqual } from "node:crypto";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function isAuthorizedCron(request: Request): {
  ok: boolean;
  misconfigured?: boolean;
} {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return { ok: false, misconfigured: true };
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return { ok: false };
  const provided = header.slice("Bearer ".length).trim();
  if (!provided) return { ok: false };
  return { ok: timingSafeEqual(sha256(provided), sha256(expected)) };
}
