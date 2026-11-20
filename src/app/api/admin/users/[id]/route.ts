import { NextResponse } from "next/server";
import { z } from "zod";
import { isConfiguredAdminEmail } from "@/lib/auth/admin-emails";
import { requireTeacherUser, setSessionCookie } from "@/lib/auth/cookies";
import { hashPassword } from "@/lib/auth/password";
import { signSessionToken } from "@/lib/auth/session";
import {
  formatClassroom,
  isClassRoom,
  isGradeLevel,
  joinFullName,
} from "@/lib/constants/classroom";
import { userRoleSchema } from "@/lib/constants/tech-taxonomy";
import { withSystemDb } from "@/lib/db/pool";
import type { Profile } from "@/types/database";

const uuidSchema = z.string().uuid();

const patchUserSchema = z
  .object({
    firstName: z.string().trim().max(60).optional(),
    lastName: z.string().trim().max(60).optional(),
    full_name: z.string().trim().max(120).optional(),
    nickname: z.string().trim().max(40, "ชื่อเล่นยาวเกินไป").optional().nullable(),
    gradeLevel: z.string().trim().max(20).optional().nullable(),
    room: z.string().trim().max(10).optional().nullable(),
    grade: z.string().trim().max(80).optional().nullable(),
    role: userRoleSchema,
    contact: z.string().trim().max(120).optional().nullable(),
    newPassword: z.string().max(128).optional().nullable(),
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
    } else if ((data.full_name ?? "").length < 2) {
      ctx.addIssue({
        code: "custom",
        message: "กรุณากรอกชื่อ-นามสกุลอย่างน้อย 2 ตัวอักษร",
        path: ["full_name"],
      });
    }

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
    if (
      data.newPassword &&
      data.newPassword.trim().length > 0 &&
      data.newPassword.length < 8
    ) {
      ctx.addIssue({
        code: "custom",
        message: "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร",
        path: ["newPassword"],
      });
    }
  });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireTeacherUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "รหัสผู้ใช้ไม่ถูกต้อง" }, { status: 400 });
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

  const parsed = patchUserSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const fullName =
    parsed.data.firstName !== undefined || parsed.data.lastName !== undefined
      ? joinFullName(parsed.data.firstName ?? "", parsed.data.lastName ?? "")
      : (parsed.data.full_name ?? "").trim();

  const structuredGrade = formatClassroom(
    parsed.data.gradeLevel,
    parsed.data.room,
  );
  const nickname =
    parsed.data.nickname === undefined
      ? undefined
      : parsed.data.nickname?.trim() || null;
  const grade = structuredGrade ?? (parsed.data.grade?.trim() || null);
  const contact = parsed.data.contact?.trim() || null;
  const rawNewPassword = parsed.data.newPassword?.trim() || "";

  try {
    const nextHash = rawNewPassword ? await hashPassword(rawNewPassword) : null;

    const outcome = await withSystemDb(async (client) => {
      const targetRes = await client.query<{
        role: string;
        email: string;
        nickname: string | null;
      }>("SELECT role, email, nickname FROM public.profiles WHERE id = $1 LIMIT 1", [
        id,
      ]);
      if (targetRes.rows.length === 0) {
        return { kind: "not_found" as const };
      }
      const targetUser = targetRes.rows[0];
      const nextNickname =
        nickname === undefined ? targetUser.nickname : nickname;

      if (parsed.data.role === "student") {
        if (isConfiguredAdminEmail(targetUser.email)) {
          return { kind: "protected_admin" as const };
        }
        const otherTeachers = await client.query<{ total: number }>(
          `SELECT count(*)::int AS total
           FROM public.profiles
           WHERE role = 'teacher' AND id <> $1`,
          [id],
        );
        if ((otherTeachers.rows[0]?.total ?? 0) < 1) {
          return { kind: "last_teacher" as const };
        }
      }

      const updatedRes = await client.query<Profile>(
        `UPDATE public.profiles
         SET full_name = $1,
             nickname = $2,
             grade = $3,
             role = $4,
             contact = $5
         WHERE id = $6
         RETURNING id, full_name, nickname, email, role, grade, skills, contact,
                   github_url, portfolio_url, directory_visible,
                   created_at::text, updated_at::text`,
        [fullName, nextNickname, grade, parsed.data.role, contact, id],
      );
      const updated = updatedRes.rows[0];
      if (!updated) {
        return { kind: "not_found" as const };
      }

      if (nextHash) {
        await client.query(
          "UPDATE public.auth_accounts SET password_hash = $1 WHERE id = $2",
          [nextHash, id],
        );
      }

      return { kind: "updated" as const, user: updated };
    });

    if (outcome.kind === "not_found") {
      return NextResponse.json(
        { error: "ไม่พบบัญชีผู้ใช้ที่ต้องการแก้ไข" },
        { status: 404 },
      );
    }

    if (outcome.kind === "protected_admin") {
      return NextResponse.json(
        { error: "ไม่สามารถลดสิทธิ์หรือลบบัญชีผู้ดูแลระบบหลักได้" },
        { status: 400 },
      );
    }

    if (outcome.kind === "last_teacher") {
      return NextResponse.json(
        { error: "ต้องมีผู้ดูแลระบบ / อาจารย์เหลืออยู่อย่างน้อย 1 บัญชี" },
        { status: 400 },
      );
    }

    const response = NextResponse.json({ user: outcome.user }, { status: 200 });

    if (outcome.user.id === auth.user.id) {
      const token = await signSessionToken({
        id: outcome.user.id,
        email: outcome.user.email,
        role: outcome.user.role,
        fullName: outcome.user.full_name,
      });
      setSessionCookie(response, token);
    }

    return response;
  } catch (error) {
    console.error("[api/admin/users/[id]] PATCH error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถบันทึกการแก้ไขผู้ใช้ได้" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireTeacherUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "รหัสผู้ใช้ไม่ถูกต้อง" }, { status: 400 });
  }

  if (id === auth.user.id) {
    return NextResponse.json(
      { error: "ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่ได้" },
      { status: 400 },
    );
  }

  try {
    const outcome = await withSystemDb(async (client) => {
      const targetRes = await client.query<{ role: string; email: string }>(
        "SELECT role, email FROM public.profiles WHERE id = $1 LIMIT 1",
        [id],
      );
      const target = targetRes.rows[0];
      if (!target) {
        return { kind: "not_found" as const };
      }

      if (isConfiguredAdminEmail(target.email)) {
        return { kind: "protected_admin" as const };
      }

      if (target.role === "teacher") {
        const otherTeachers = await client.query<{ total: number }>(
          `SELECT count(*)::int AS total
           FROM public.profiles
           WHERE role = 'teacher' AND id <> $1`,
          [id],
        );
        if ((otherTeachers.rows[0]?.total ?? 0) < 1) {
          return { kind: "last_teacher" as const };
        }
      }

      await client.query("DELETE FROM public.auth_accounts WHERE id = $1", [
        id,
      ]);

      return { kind: "deleted" as const };
    });

    if (outcome.kind === "not_found") {
      return NextResponse.json(
        { error: "ไม่พบบัญชีผู้ใช้ที่ต้องการลบ" },
        { status: 404 },
      );
    }

    if (outcome.kind === "protected_admin") {
      return NextResponse.json(
        { error: "ไม่สามารถลดสิทธิ์หรือลบบัญชีผู้ดูแลระบบหลักได้" },
        { status: 400 },
      );
    }

    if (outcome.kind === "last_teacher") {
      return NextResponse.json(
        { error: "ไม่สามารถลบผู้ดูแลระบบคนสุดท้ายได้" },
        { status: 400 },
      );
    }

    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (error) {
    console.error("[api/admin/users/[id]] DELETE error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถลบบัญชีผู้ใช้ได้" },
      { status: 500 },
    );
  }
}
