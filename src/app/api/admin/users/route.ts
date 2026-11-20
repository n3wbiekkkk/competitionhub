import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacherUser } from "@/lib/auth/cookies";
import { hashPassword } from "@/lib/auth/password";
import {
  formatClassroom,
  isClassRoom,
  isGradeLevel,
  joinFullName,
} from "@/lib/constants/classroom";
import { userRoleSchema } from "@/lib/constants/tech-taxonomy";
import { withSystemDb, withUserDb } from "@/lib/db/pool";
import type { AdminUserItem, Profile } from "@/types/database";

interface AdminUserRow extends Profile {
  interest_count: string;
  confirmed_team_count: string;
}

const createUserSchema = z
  .object({
    firstName: z.string().trim().min(1, "กรุณากรอกชื่อ").max(60),
    lastName: z.string().trim().min(1, "กรุณากรอกนามสกุล").max(60),
    nickname: z.string().trim().max(40, "ชื่อเล่นยาวเกินไป").optional().nullable(),
    email: z.string().trim().email("รูปแบบอีเมลไม่ถูกต้อง"),
    password: z
      .string()
      .min(8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร")
      .max(128, "รหัสผ่านยาวเกินไป"),
    role: userRoleSchema.default("student"),
    gradeLevel: z.string().trim().max(20).optional().nullable(),
    room: z.string().trim().max(10).optional().nullable(),
    grade: z.string().trim().max(80).optional().nullable(),
    contact: z.string().trim().max(120).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.gradeLevel && !isGradeLevel(data.gradeLevel)) {
      ctx.addIssue({
        code: "custom",
        message: "ระดับชั้นต้องเป็น ม.1–ม.6",
        path: ["gradeLevel"],
      });
    }
    if (data.room && !isClassRoom(data.room)) {
      ctx.addIssue({
        code: "custom",
        message: "ห้องต้องอยู่ระหว่าง 1–14",
        path: ["room"],
      });
    }
  });

export async function GET() {
  const auth = await requireTeacherUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const users = await withUserDb(auth.user.id, async (client) => {
      const res = await client.query<AdminUserRow>(
        `SELECT p.id, p.full_name, p.nickname, p.email, p.role, p.grade, p.skills,
                p.contact, p.github_url, p.portfolio_url, p.bio, p.avatar_url, p.discord_url, p.line_url, p.directory_visible,
                p.created_at::text, p.updated_at::text,
                COALESCE((
                  SELECT count(*)::text FROM public.interests i WHERE i.user_id = p.id
                ), '0') AS interest_count,
                COALESCE((
                  SELECT count(*)::text
                  FROM public.team_members tm
                  JOIN public.teams t ON t.id = tm.team_id
                  WHERE tm.user_id = p.id AND t.status = 'confirmed'
                ), '0') AS confirmed_team_count
         FROM public.profiles p
         ORDER BY p.created_at DESC`,
      );

      return res.rows.map(
        (row): AdminUserItem => ({
          ...row,
          interest_count: Number(row.interest_count),
          confirmed_team_count: Number(row.confirmed_team_count),
        }),
      );
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("[api/admin/users] GET error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถดึงรายชื่อผู้ใช้ได้" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireTeacherUser();
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

  const parsed = createUserSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const fullName = joinFullName(parsed.data.firstName, parsed.data.lastName);
  const nickname = parsed.data.nickname?.trim() || null;
  const structuredGrade = formatClassroom(
    parsed.data.gradeLevel,
    parsed.data.room,
  );
  const grade = structuredGrade ?? (parsed.data.grade?.trim() || null);
  const contact = parsed.data.contact?.trim() || null;

  try {
    const passwordHash = await hashPassword(parsed.data.password);

    const outcome = await withSystemDb(async (client) => {
      const existing = await client.query<{ id: string }>(
        "SELECT id FROM public.auth_accounts WHERE lower(email) = lower($1) LIMIT 1",
        [normalizedEmail],
      );
      if (existing.rows.length > 0) {
        return { kind: "conflict" as const };
      }

      const accountRes = await client.query<{ id: string }>(
        `INSERT INTO public.auth_accounts (email, password_hash)
         VALUES ($1, $2)
         RETURNING id`,
        [normalizedEmail, passwordHash],
      );
      const accountId = accountRes.rows[0]?.id;
      if (!accountId) {
        throw new Error("Failed to create account");
      }

      const profileRes = await client.query<Profile>(
        `INSERT INTO public.profiles (id, full_name, nickname, email, role, grade, contact)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, full_name, nickname, email, role, grade, skills, contact,
                   github_url, portfolio_url, bio, avatar_url, discord_url, line_url, directory_visible,
                   created_at::text, updated_at::text`,
        [
          accountId,
          fullName,
          nickname,
          normalizedEmail,
          parsed.data.role,
          grade,
          contact,
        ],
      );
      const profile = profileRes.rows[0];
      if (!profile) {
        throw new Error("Failed to create profile");
      }

      const item: AdminUserItem = {
        ...profile,
        interest_count: 0,
        confirmed_team_count: 0,
      };
      return { kind: "created" as const, user: item };
    });

    if (outcome.kind === "conflict") {
      return NextResponse.json(
        { error: "อีเมลนี้มีอยู่ในระบบแล้ว" },
        { status: 409 },
      );
    }

    return NextResponse.json({ user: outcome.user }, { status: 201 });
  } catch (error) {
    console.error("[api/admin/users] POST error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถสร้างผู้ใช้ใหม่ได้" },
      { status: 500 },
    );
  }
}
