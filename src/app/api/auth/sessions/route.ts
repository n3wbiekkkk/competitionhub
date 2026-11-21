import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth/cookies";
import { getCurrentSession } from "@/lib/auth/session";
import { withSystemDb } from "@/lib/db/pool";
import type { UserSessionItem } from "@/types/database";

export async function GET() {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const current = await getCurrentSession();

  const sessions = await withSystemDb(async (client) => {
    const result = await client.query<UserSessionItem>(
      `select jti, user_agent, ip_address,
              created_at::text, last_active_at::text,
              jti = $2 as is_current
       from public.user_sessions
       where user_id = $1 and revoked_at is null
       order by last_active_at desc
       limit 50`,
      [auth.user.id, current?.jti ?? ""],
    );
    return result.rows;
  });
  return NextResponse.json({ sessions });
}
