import { NextResponse } from "next/server";
import { z } from "zod";
import { setSessionCookie } from "@/lib/auth/cookies";
import { verifyPassword } from "@/lib/auth/password";
import { signSessionToken } from "@/lib/auth/session";
import { withSystemDb } from "@/lib/db/pool";
import type { Profile } from "@/types/database";

const loginSchema = z.object({
  email: z.string().trim().email("รูปแบบอีเมลไม่ถูกต้อง"),
  password: z.string().min(1, "กรุณากรอกรหัสผ่าน"),
});

interface AccountRow extends Profile {
  password_hash: string;
  session_version: number;
}

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "รูปแบบข้อมูลไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  const parsed = loginSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const normalizedEmail = parsed.data.email.toLowerCase();

  try {
    const account = await withSystemDb(async (client) => {
      const result = await client.query<AccountRow>(
        `SELECT a.password_hash,
                p.id, p.full_name, p.nickname, p.email, p.role, p.grade, p.skills,
                p.contact, p.github_url, p.portfolio_url, p.bio, p.avatar_url, p.discord_url, p.line_url, p.directory_visible,
                p.created_at::text, p.updated_at::text,
                coalesce(
                  (SELECT s.session_version FROM public.auth_security s WHERE s.user_id = a.id),
                  0
                ) AS session_version
         FROM public.auth_accounts a
         JOIN public.profiles p ON p.id = a.id
         WHERE lower(a.email) = lower($1)
         LIMIT 1`,
        [normalizedEmail],
      );
      return result.rows[0] ?? null;
    });

    if (!account) {
      return NextResponse.json(
        { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" },
        { status: 401 },
      );
    }

    const passwordMatches = await verifyPassword(
      parsed.data.password,
      account.password_hash,
    );
    if (!passwordMatches) {
      return NextResponse.json(
        { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" },
        { status: 401 },
      );
    }

    const user: Profile = {
      id: account.id,
      full_name: account.full_name,
      nickname: account.nickname,
      email: account.email,
      role: account.role,
      grade: account.grade,
      skills: account.skills,
      contact: account.contact,
      github_url: account.github_url,
      portfolio_url: account.portfolio_url,
      bio: account.bio,
      avatar_url: account.avatar_url,
      discord_url: account.discord_url,
      line_url: account.line_url,
      directory_visible: account.directory_visible,
      created_at: account.created_at,
      updated_at: account.updated_at,
    };

    const token = await signSessionToken(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
      },
      account.session_version,
    );

    const response = NextResponse.json({ user }, { status: 200 });
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    console.error("[auth/login] error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถเข้าสู่ระบบได้ในขณะนี้" },
      { status: 500 },
    );
  }
}
