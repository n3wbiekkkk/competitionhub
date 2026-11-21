import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/auth/cron";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { getRequestIp } from "@/lib/utils/request-ip";
import { runAutoTechScout } from "@/lib/ai/scout";
import { logError } from "@/lib/utils/logger";

async function handleCron(request: Request) {
  const auth = isAuthorizedCron(request);
  if (auth.misconfigured) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on the server." },
      { status: 500 },
    );
  }
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await consumeRateLimit(`cron:discover:${getRequestIp(request)}`, 1, 60_000)).allowed) {
    return NextResponse.json({ error: "เรียกงานถี่เกินไป" }, { status: 429 });
  }

  try {
    const summary = await runAutoTechScout({ maxProcess: 8 });
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    logError("[api/cron/discover] error:", error);
    return NextResponse.json(
      {
        error: "เกิดข้อผิดพลาดระหว่างค้นหาการแข่งขัน กรุณาลองใหม่ในภายหลัง",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}
