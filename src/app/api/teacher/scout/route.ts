import { NextResponse } from "next/server";
import { z } from "zod";
import { runAutoTechScout, type ScoutProgressEvent } from "@/lib/ai/scout";
import { requireTeacherUser } from "@/lib/auth/cookies";
import { logError } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireTeacherUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const query = z.object({ stream: z.enum(["0", "1"]).optional() }).safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  const streamMode = query.success && query.data.stream === "1";

  if (!streamMode) {
    try {
      const summary = await runAutoTechScout({ maxProcess: 8 });
      return NextResponse.json({ ok: true, ...summary });
    } catch {
      logError("[api/teacher/scout] scout failed", new Error("scout failed"));
      return NextResponse.json(
        {
          error: "ไม่สามารถค้นหารายการแข่งสาย Tech ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง",
        },
        { status: 500 },
      );
    }
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      const safeClose = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Ignore close after client abort
        }
      };

      const safeEnqueue = (event: ScoutProgressEvent) => {
        if (closed || request.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };

      request.signal.addEventListener("abort", safeClose, { once: true });

      try {
        await runAutoTechScout({
          maxProcess: 8,
          signal: request.signal,
          onProgress: safeEnqueue,
        });
      } catch {
        if (!request.signal.aborted) {
          safeEnqueue({
            type: "error",
            message: "ไม่สามารถค้นหารายการแข่งสาย Tech ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง",
          });
        }
      } finally {
        safeClose();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
