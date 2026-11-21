import { randomUUID } from "node:crypto";
import type { NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth/cookies";
import { signSessionToken } from "@/lib/auth/session";
import { withSystemDb } from "@/lib/db/pool";
import { getRequestIp } from "@/lib/utils/request-ip";
import type { SessionUser } from "@/types/database";

export async function issueSessionCookie(
  response: NextResponse,
  user: SessionUser,
  sessionVersion: number,
  request: Request,
): Promise<string> {
  const jti = randomUUID();
  await withSystemDb(async (client) => {
    await client.query(
      `INSERT INTO public.user_sessions (jti, user_id, user_agent, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [jti, user.id, request.headers.get("user-agent")?.slice(0, 300) ?? null, getRequestIp(request)],
    );
  });
  const token = await signSessionToken(user, sessionVersion, jti);
  setSessionCookie(response, token);
  return jti;
}
