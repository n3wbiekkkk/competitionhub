import { requireAuthUser } from "@/lib/auth/cookies";
import { normalizeCursor } from "@/lib/realtime/cursor";
import { advanceCursor, dedupeEvents, encodeSseFrame } from "@/lib/realtime/protocol";
import { loadRealtimeEvents } from "@/lib/realtime/server";
import type { RealtimeEvent } from "@/lib/realtime/types";
import { logError } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 3_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const SEEN_LIMIT = 500;

export async function GET(request: Request) {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const cursorParam = new URL(request.url).searchParams.get("since");
  const encoder = new TextEncoder();
  let cursor = normalizeCursor(cursorParam);
  const seen = new Set<string>();
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let abortListener: (() => void) | undefined;
  let closed = false;
  let inFlight = false;
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        if (pollTimer) clearInterval(pollTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (abortListener) request.signal.removeEventListener("abort", abortListener);
        try {
          controller.close();
        } catch {
          // The client already closed the stream.
        }
      };
      cleanup = close;

      const send = (event: RealtimeEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeSseFrame(event)));
        } catch {
          close();
        }
      };

      const poll = async () => {
        if (closed || inFlight) return;
        inFlight = true;
        try {
          const result = await loadRealtimeEvents({ userId: auth.user.id, since: cursor });
          const deduped = dedupeEvents(result.events, seen);
          seen.clear();
          for (const id of deduped.seen) seen.add(id);
          if (seen.size > SEEN_LIMIT) {
            for (const id of [...seen].slice(0, seen.size - SEEN_LIMIT)) seen.delete(id);
          }
          cursor = advanceCursor(cursor, result.events);
          for (const event of deduped.events) send(event);
        } catch (error) {
          logError("[sse] scoped poll failed", error);
        } finally {
          inFlight = false;
        }
      };

      abortListener = close;
      request.signal.addEventListener("abort", abortListener, { once: true });

      send({
        kind: "ready",
        id: `ready:${Date.now()}`,
        at: new Date().toISOString(),
      });
      void poll();
      pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
      heartbeatTimer = setInterval(() => {
        send({ kind: "heartbeat", id: `heartbeat:${Date.now()}`, at: new Date().toISOString() });
      }, HEARTBEAT_INTERVAL_MS);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
