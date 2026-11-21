import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/cookies";
import { getCurrentSession } from "@/lib/auth/session";
import { withSystemDb } from "@/lib/db/pool";

export async function POST() {
  const session = await getCurrentSession();
  if (session) {
    await withSystemDb(async (client) => {
      await client.query(
        "update public.user_sessions set revoked_at = now() where jti = $1",
        [session.jti],
      );
    });
  }
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
