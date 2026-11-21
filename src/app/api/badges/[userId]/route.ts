import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser } from "@/lib/auth/cookies";
import { getBadgeShowcase } from "@/lib/db/badges";
import { logError } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json(
      { error: "รหัสผู้ใช้ไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  try {
    const showcase = await getBadgeShowcase({
      viewerId: auth.user.id,
      userId,
    });
    return NextResponse.json(showcase);
  } catch (error) {
    logError("[api/badges/[userId]] GET error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถโหลดตราประจำตัวของผู้ใช้นี้ได้" },
      { status: 500 },
    );
  }
}
