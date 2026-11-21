import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth/cookies";
import { clearSessionCookie } from "@/lib/auth/cookies";
import { withSystemDb } from "@/lib/db/pool";

export async function POST() {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  await withSystemDb(async (client) => {
    await client.query(
      "update public.user_sessions set revoked_at = now() where user_id = $1 and revoked_at is null",
      [auth.user.id],
    );
  });
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
