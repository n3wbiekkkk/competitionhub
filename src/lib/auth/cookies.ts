import { NextResponse } from "next/server";
import {
  getCurrentSession,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/session";
import { withUserDb } from "@/lib/db/pool";
import type { Profile } from "@/types/database";

function shouldUseSecureCookie(): boolean {
  const raw = process.env.COOKIE_SECURE?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    path: "/",
    maxAge: 0,
  });
}

interface LiveAuthRow extends Profile {
  session_version: number;
}

/**
 * Fetches the currently authenticated user's live Profile from PostgreSQL
 * under RLS (app.current_user_id = session.id) and verifies that the token's
 * session version still matches `auth_security.session_version`.
 * Returns null if unauthenticated, stale, deleted, or the database is offline.
 */
export async function getAuthenticatedProfile(): Promise<Profile | null> {
  const session = await getCurrentSession();
  if (!session) {
    return null;
  }

  try {
    const row = await withUserDb(session.user.id, async (client) => {
      const result = await client.query<LiveAuthRow>(
        `SELECT p.id, p.full_name, p.nickname, p.email, p.role, p.grade, p.skills,
                p.contact, p.github_url, p.portfolio_url, p.bio, p.avatar_url, p.discord_url, p.line_url, p.directory_visible,
                p.created_at::text, p.updated_at::text,
                public.app_session_version() AS session_version
         FROM public.profiles p
         WHERE p.id = $1
         LIMIT 1`,
        [session.user.id],
      );
      return result.rows[0] ?? null;
    });

    if (!row || row.session_version !== session.sessionVersion) {
      return null;
    }

    return {
      id: row.id,
      full_name: row.full_name,
      nickname: row.nickname,
      email: row.email,
      role: row.role,
      grade: row.grade,
      skills: row.skills,
      contact: row.contact,
      github_url: row.github_url,
      portfolio_url: row.portfolio_url,
      bio: row.bio,
      avatar_url: row.avatar_url,
      discord_url: row.discord_url,
      line_url: row.line_url,
      directory_visible: row.directory_visible,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  } catch (error) {
    console.error("[auth] failed to load live profile", error);
    return null;
  }
}

export type AuthCheckResult =
  | { ok: true; user: Profile }
  | { ok: false; status: 401 | 403; error: string };

export async function requireAuthUser(): Promise<AuthCheckResult> {
  const user = await getAuthenticatedProfile();
  if (!user) {
    return {
      ok: false,
      status: 401,
      error: "กรุณาเข้าสู่ระบบก่อนดำเนินการ",
    };
  }
  return { ok: true, user };
}

export async function requireTeacherUser(): Promise<AuthCheckResult> {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return auth;
  }
  if (auth.user.role !== "teacher") {
    return {
      ok: false,
      status: 403,
      error: "เฉพาะอาจารย์ที่ปรึกษาเท่านั้นที่สามารถดำเนินการนี้ได้",
    };
  }
  return auth;
}
