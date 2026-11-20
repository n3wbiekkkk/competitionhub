import { NextResponse } from "next/server";
import { z } from "zod";
import { isConfiguredAdminEmail } from "@/lib/auth/admin-emails";
import { setSessionCookie } from "@/lib/auth/cookies";
import { hashPassword } from "@/lib/auth/password";
import { signSessionToken } from "@/lib/auth/session";
import {
  formatClassroom,
  isClassRoom,
  isGradeLevel,
  joinFullName,
} from "@/lib/constants/classroom";
import type { UserRole } from "@/lib/constants/tech-taxonomy";
import { withSystemDb } from "@/lib/db/pool";
import type { Profile } from "@/types/database";

const registerSchema = z
  .object({
    email: z.string().trim().email("รูปแบบอีเมลไม่ถูกต้อง"),
    password: z
      .string()
      .min(8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร")
      .max(128, "รหัสผ่านยาวเกินไป"),
    firstName: z.string().trim().max(60, "ชื่อยาวเกินไป").optional(),
    lastName: z.string().trim().max(60, "นามสกุลยาวเกินไป").optional(),
    fullName: z.string().trim().max(120, "ชื่อ-นามสกุลยาวเกินไป").optional(),
    nickname: z.string().trim().max(40, "ชื่อเล่นยาวเกินไป").optional().nullable(),
    gradeLevel: z.string().trim().max(20).optional().nullable(),
    room: z.string().trim().max(10).optional().nullable(),
    grade: z
      .string()
      .trim()
      .max(80, "ข้อมูลระดับชั้น/ห้องยาวเกินไป")
      .optional()
      .nullable(),
  })
  .superRefine((data, ctx) => {
    const hasSplit = Boolean(
      data.firstName !== undefined || data.lastName !== undefined,
    );
    if (hasSplit) {
      if ((data.firstName ?? "").length < 1) {
        ctx.addIssue({
          code: "custom",
          message: "กรุณากรอกชื่อ",
          path: ["firstName"],
        });
      }
      if ((data.lastName ?? "").length < 1) {
        ctx.addIssue({
          code: "custom",
          message: "กรุณากรอกนามสกุล",
          path: ["lastName"],
        });
      }
    } else if ((data.fullName ?? "").length < 2) {
      ctx.addIssue({
        code: "custom",
        message: "กรุณากรอกชื่อ-นามสกุลอย่างน้อย 2 ตัวอักษร",
        path: ["fullName"],
      });
    }

    if (data.gradeLevel && !isGradeLevel(data.gradeLevel)) {
      ctx.addIssue({
        code: "custom",
        message: "กรุณาเลือกระดับชั้น ม.1–ม.6",
        path: ["gradeLevel"],
      });
    }

    if (data.room && !isClassRoom(data.room)) {
      ctx.addIssue({
        code: "custom",
        message: "กรุณาเลือกห้อง 1–14",
        path: ["room"],
      });
    }
  });

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

  const parsed = registerSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "ข้อมูลไม่ครบถ้วน";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const fullName =
    parsed.data.firstName !== undefined || parsed.data.lastName !== undefined
      ? joinFullName(parsed.data.firstName ?? "", parsed.data.lastName ?? "")
      : (parsed.data.fullName ?? "").trim();

  if (fullName.length < 2) {
    return NextResponse.json(
      { error: "กรุณากรอกชื่อและนามสกุลให้ครบถ้วน" },
      { status: 400 },
    );
  }

  const structuredGrade = formatClassroom(
    parsed.data.gradeLevel,
    parsed.data.room,
  );
  const grade = structuredGrade ?? (parsed.data.grade?.trim() || null);
  const nickname = parsed.data.nickname?.trim() || null;

  try {
    const passwordHash = await hashPassword(parsed.data.password);

    const outcome = await withSystemDb(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(742901)");

      const existing = await client.query<{ id: string }>(
        "SELECT id FROM public.auth_accounts WHERE lower(email) = lower($1) LIMIT 1",
        [normalizedEmail],
      );

      if (existing.rows.length > 0) {
        return { kind: "conflict" as const };
      }

      const countRes = await client.query<{ total: number }>(
        "SELECT count(*)::int AS total FROM public.profiles",
      );
      const existingProfileCount = countRes.rows[0]?.total ?? 0;
      const assignedRole: UserRole =
        existingProfileCount === 0 || isConfiguredAdminEmail(normalizedEmail)
          ? "teacher"
          : "student";

      const accountRes = await client.query<{ id: string }>(
        `INSERT INTO public.auth_accounts (email, password_hash)
         VALUES ($1, $2)
         RETURNING id`,
        [normalizedEmail, passwordHash],
      );
      const accountId = accountRes.rows[0]?.id;
      if (!accountId) {
        throw new Error("Failed to create auth account");
      }

      const profileRes = await client.query<Profile>(
        `INSERT INTO public.profiles (id, full_name, nickname, email, role, grade)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, full_name, nickname, email, role, grade, skills, contact,
                   github_url, portfolio_url, directory_visible,
                   created_at::text, updated_at::text`,
        [accountId, fullName, nickname, normalizedEmail, assignedRole, grade],
      );

      const profile = profileRes.rows[0];
      if (!profile) {
        throw new Error("Failed to create user profile");
      }

      await client.query(
        `INSERT INTO public.auth_security (user_id, session_version)
         VALUES ($1, 0)
         ON CONFLICT (user_id) DO NOTHING`,
        [accountId],
      );

      return { kind: "created" as const, profile };
    });

    if (outcome.kind === "conflict") {
      return NextResponse.json(
        { error: "อีเมลนี้ถูกใช้งานแล้ว กรุณาเข้าสู่ระบบ" },
        { status: 409 },
      );
    }

    const token = await signSessionToken(
      {
        id: outcome.profile.id,
        email: outcome.profile.email,
        role: outcome.profile.role,
        fullName: outcome.profile.full_name,
      },
      0,
    );

    const response = NextResponse.json(
      {
        user: outcome.profile,
        bootstrappedAdmin: outcome.profile.role === "teacher",
      },
      { status: 201 },
    );
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    console.error("[auth/register] error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถสมัครสมาชิกได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }
}
