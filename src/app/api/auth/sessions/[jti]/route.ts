import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser } from "@/lib/auth/cookies";
import { withSystemDb } from "@/lib/db/pool";

const uuidSchema = z.string().uuid();

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ jti: string }> },
) {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { jti } = await context.params;
  if (!uuidSchema.safeParse(jti).success) {
    return NextResponse.json({ error: "รหัสเซสชันไม่ถูกต้อง" }, { status: 400 });
  }

  await withSystemDb(async (client) => {
    await client.query(
      "update public.user_sessions set revoked_at = now() where jti = $1 and user_id = $2",
      [jti, auth.user.id],
    );
  });
  return NextResponse.json({ ok: true });
}
