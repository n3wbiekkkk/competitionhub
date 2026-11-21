import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth/cookies";
import {
  getVerifiedSkillEvidence,
  listBadgeDefinitions,
  listMyBadges,
} from "@/lib/db/badges";
import { logError } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const [definitions, badges, skills] = await Promise.all([
      listBadgeDefinitions(),
      listMyBadges(auth.user.id),
      getVerifiedSkillEvidence({ viewerId: auth.user.id, userId: auth.user.id }),
    ]);

    return NextResponse.json({ definitions, badges, skills });
  } catch (error) {
    logError("[api/badges] GET error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถโหลดตราเกียรติยศได้" },
      { status: 500 },
    );
  }
}
