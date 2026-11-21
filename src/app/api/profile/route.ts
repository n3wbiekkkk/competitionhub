import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser, setSessionCookie } from "@/lib/auth/cookies";
import { signSessionToken } from "@/lib/auth/session";
import { withUserDb } from "@/lib/db/pool";
import { isValidProfileLink, SOCIAL_HOSTS } from "@/lib/utils/profile-links";
import type { Profile } from "@/types/database";
import { logError } from "@/lib/utils/logger";

const profilePatchSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "กรุณากรอกชื่อ-นามสกุลอย่างน้อย 2 ตัวอักษร")
    .max(120, "ชื่อ-นามสกุลยาวเกินไป"),
  nickname: z
    .string()
    .trim()
    .max(40, "ชื่อเล่นยาวเกินไป")
    .nullable()
    .optional(),
  grade: z
    .string()
    .trim()
    .max(80, "ระดับชั้น/ห้องยาวเกินไป")
    .nullable()
    .optional(),
  skills: z
    .array(z.string().trim().min(1).max(40))
    .max(30, "เลือกทักษะได้สูงสุด 30 รายการ"),
  contact: z
    .string()
    .trim()
    .max(120, "ข้อมูลติดต่อยาวเกินไป")
    .nullable()
    .optional(),
  github_url: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .optional()
    .refine((value) => isValidProfileLink(value, SOCIAL_HOSTS.github), {
      message: "ลิงก์ GitHub ต้องเป็น URL สาธารณะของ GitHub",
    }),
  portfolio_url: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .optional()
    .refine((value) => isValidProfileLink(value), {
      message: "ลิงก์ผลงานต้องเป็น URL สาธารณะ http:// หรือ https://",
    }),
  bio: z.string().trim().max(240).nullable().optional(),
  discord_url: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .optional()
    .refine((value) => isValidProfileLink(value, SOCIAL_HOSTS.discord), {
      message: "ลิงก์ Discord ต้องเป็น URL สาธารณะของ Discord",
    }),
  line_url: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .optional()
    .refine((value) => isValidProfileLink(value, SOCIAL_HOSTS.line), {
      message: "ลิงก์ LINE ต้องเป็น URL สาธารณะของ LINE",
    }),
  directory_visible: z.boolean().optional(),
});

export async function GET() {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  return NextResponse.json({ profile: auth.user });
}

export async function PATCH(request: Request) {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "รูปแบบข้อมูลไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  const parsed = profilePatchSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const optionalText = (
    value: string | null | undefined,
    fallback: string | null,
  ) => (value === undefined ? fallback : value?.trim() || null);

  const deduplicatedSkills = Array.from(
    new Set(parsed.data.skills.map((s) => s.trim()).filter(Boolean)),
  );
  const nickname = optionalText(parsed.data.nickname, auth.user.nickname);
  const grade = optionalText(parsed.data.grade, auth.user.grade);
  const contact = optionalText(parsed.data.contact, auth.user.contact);
  const githubUrl = optionalText(parsed.data.github_url, auth.user.github_url);
  const portfolioUrl = optionalText(parsed.data.portfolio_url, auth.user.portfolio_url);
  const bio = optionalText(parsed.data.bio, auth.user.bio);
  const discordUrl = optionalText(parsed.data.discord_url, auth.user.discord_url);
  const lineUrl = optionalText(parsed.data.line_url, auth.user.line_url);
  const directoryVisible =
    parsed.data.directory_visible ?? auth.user.directory_visible;

  try {
    const updatedRow = await withUserDb(auth.user.id, async (client) => {
      const result = await client.query<Profile>(
        `UPDATE public.profiles
         SET full_name = $1,
             nickname = $2,
             grade = $3,
             skills = $4,
             contact = $5,
             github_url = $6,
             portfolio_url = $7,
             bio = $8,
             discord_url = $9,
             line_url = $10,
             directory_visible = $11
         WHERE id = $12
         RETURNING id, full_name, nickname, email, role, grade, skills, contact,
                   github_url, portfolio_url, bio, avatar_url, discord_url, line_url,
                   directory_visible, created_at::text, updated_at::text`,
        [
          parsed.data.full_name,
          nickname,
          grade,
          deduplicatedSkills,
          contact,
          githubUrl,
          portfolioUrl,
          bio,
          discordUrl,
          lineUrl,
          directoryVisible,
          auth.user.id,
        ],
      );
      return {
        profile: result.rows[0] ?? null,
        sessionVersion:
          (
            await client.query<{ session_version: number }>(
              "SELECT public.app_session_version() AS session_version",
            )
          ).rows[0]?.session_version ?? 0,
      };
    });
    const updated = updatedRow.profile;
    const sessionVersion = updatedRow.sessionVersion;

    if (!updated) {
      return NextResponse.json(
        { error: "ไม่พบข้อมูลโปรไฟล์ของคุณ" },
        { status: 404 },
      );
    }

    const refreshedToken = await signSessionToken(
      {
        id: updated.id,
        email: updated.email,
        role: updated.role,
        fullName: updated.full_name,
      },
      sessionVersion,
    );

    const response = NextResponse.json({ profile: updated }, { status: 200 });
    setSessionCookie(response, refreshedToken);
    return response;
  } catch (error) {
    logError("[api/profile] update error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถบันทึกโปรไฟล์ได้ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }
}
