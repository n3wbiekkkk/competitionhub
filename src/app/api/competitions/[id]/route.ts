import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedProfile, requireTeacherUser } from "@/lib/auth/cookies";
import {
  competitionStatusSchema,
  techCategorySchema,
} from "@/lib/constants/tech-taxonomy";
import { withUserDb } from "@/lib/db/pool";
import { writeAudit } from "@/lib/utils/audit";
import { normalizeToIsoCeDate } from "@/lib/utils/thai-date";
import type { Competition, Interest } from "@/types/database";
import { logError } from "@/lib/utils/logger";

const uuidSchema = z.string().uuid();

function isValidOptionalHttpUrl(value: string | null | undefined): boolean {
  if (!value || value.trim() === "") {
    return true;
  }
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const patchCompetitionSchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    category: techCategorySchema.optional(),
    deadline: z.string().nullable().optional(),
    min_size: z.coerce.number().int().min(1).max(20).optional(),
    max_size: z.coerce.number().int().min(1).max(20).optional(),
    recommended_roles: z.array(z.string().trim().min(1).max(50)).optional(),
    tech_stack_hints: z.array(z.string().trim().min(1).max(50)).optional(),
    eligibility: z.string().trim().max(500).nullable().optional(),
    summary: z.string().trim().min(5).max(4000).optional(),
    source_url: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .optional()
      .refine(isValidOptionalHttpUrl, {
        message: "ลิงก์แหล่งที่มาต้องขึ้นต้นด้วย http:// หรือ https://",
      }),
    status: competitionStatusSchema.optional(),
  })
  .refine(
    (val) =>
      val.min_size === undefined ||
      val.max_size === undefined ||
      val.max_size >= val.min_size,
    { message: "จำนวนสมาชิกสูงสุดต้องมากกว่าหรือเท่ากับขั้นต่ำ" },
  );

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "รหัสรายการแข่งขันไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  const user = await getAuthenticatedProfile();

  try {
    const data = await withUserDb(user?.id ?? null, async (client) => {
      const compRes = await client.query<Competition>(
        `SELECT id, title, category, deadline::text, min_size, max_size,
                recommended_roles, tech_stack_hints, eligibility, summary,
                source_url, source_type, status, created_by,
                created_at::text, updated_at::text
         FROM public.competitions
         WHERE id = $1
         LIMIT 1`,
        [id],
      );

      const competition = compRes.rows[0];
      if (!competition) {
        return null;
      }

      const countRes = await client.query<{ interest_count: string }>(
        `SELECT interest_count::text
         FROM public.get_competition_interest_counts(ARRAY[$1::uuid])`,
        [id],
      );
      const interestCount = Number(countRes.rows[0]?.interest_count ?? 0);

      let myInterest: Interest | null = null;
      if (user) {
        const interestRes = await client.query<Interest>(
          `SELECT id, user_id, competition_id, preferred_role, note, created_at::text
           FROM public.interests
           WHERE user_id = $1 AND competition_id = $2
           LIMIT 1`,
          [user.id, id],
        );
        myInterest = interestRes.rows[0] ?? null;
      }

      return {
        competition,
        interestCount,
        myInterest,
      };
    });

    if (!data) {
      return NextResponse.json(
        { error: "ไม่พบรายการแข่งขันนี้หรือคุณไม่มีสิทธิ์เข้าถึง" },
        { status: 404 },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    logError("[api/competitions/[id]] GET error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถโหลดรายละเอียดรายการแข่งขันได้" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireTeacherUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "รหัสรายการแข่งขันไม่ถูกต้อง" },
      { status: 400 },
    );
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

  const parsed = patchCompetitionSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const data = parsed.data;

  try {
    const updateResult = await withUserDb(auth.user.id, async (client) => {
      const existingRes = await client.query<Competition>(
        `SELECT id, title, category, deadline::text, min_size, max_size,
                recommended_roles, tech_stack_hints, eligibility, summary,
                source_url, source_type, status, created_by,
                created_at::text, updated_at::text
         FROM public.competitions
         WHERE id = $1
         LIMIT 1`,
        [id],
      );
      const current = existingRes.rows[0];
      if (!current) {
        return null;
      }

      const nextTitle = data.title ?? current.title;
      const nextCategory = data.category ?? current.category;
      const nextDeadline =
        data.deadline !== undefined
          ? normalizeToIsoCeDate(data.deadline)
          : current.deadline;
      const nextMinSize = data.min_size ?? current.min_size;
      const nextMaxSize = data.max_size ?? current.max_size;
      if (nextMaxSize < nextMinSize) {
        throw new Error("INVALID_SIZE_RANGE");
      }
      const nextRoles =
        data.recommended_roles !== undefined
          ? Array.from(new Set(data.recommended_roles.map((r) => r.trim()).filter(Boolean)))
          : current.recommended_roles;
      const nextHints =
        data.tech_stack_hints !== undefined
          ? Array.from(new Set(data.tech_stack_hints.map((t) => t.trim()).filter(Boolean)))
          : current.tech_stack_hints;
      const nextEligibility =
        data.eligibility !== undefined
          ? data.eligibility?.trim() || null
          : current.eligibility;
      const nextSummary = data.summary ?? current.summary;
      const nextSourceUrl =
        data.source_url !== undefined
          ? data.source_url?.trim() || null
          : current.source_url;
      const nextStatus = data.status ?? current.status;

      const updateRes = await client.query<Competition>(
        `UPDATE public.competitions
         SET title = $1,
             category = $2,
             deadline = $3::date,
             min_size = $4,
             max_size = $5,
             recommended_roles = $6,
             tech_stack_hints = $7,
             eligibility = $8,
             summary = $9,
             source_url = $10,
             status = $11
         WHERE id = $12
         RETURNING id, title, category, deadline::text, min_size, max_size,
                   recommended_roles, tech_stack_hints, eligibility, summary,
                   source_url, source_type, status, created_by,
                   created_at::text, updated_at::text`,
        [
          nextTitle,
          nextCategory,
          nextDeadline,
          nextMinSize,
          nextMaxSize,
          nextRoles,
          nextHints,
          nextEligibility,
          nextSummary,
          nextSourceUrl,
          nextStatus,
          id,
        ],
      );
      return {
        competition: updateRes.rows[0] ?? null,
        previousStatus: current.status,
      };
    });

    if (!updateResult?.competition) {
      return NextResponse.json(
        { error: "ไม่พบรายการแข่งขันนี้" },
        { status: 404 },
      );
    }

    if (data.status && data.status !== updateResult.previousStatus) {
      await writeAudit({
        actorId: auth.user.id,
        action: "teacher.competition.status",
        targetType: "competition",
        targetId: id,
        metadata: {
          from: updateResult.previousStatus,
          to: data.status,
        },
      });
    }

    return NextResponse.json({ competition: updateResult.competition });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_SIZE_RANGE") {
      return NextResponse.json(
        { error: "จำนวนสมาชิกสูงสุดต้องมากกว่าหรือเท่ากับขั้นต่ำ" },
        { status: 400 },
      );
    }
    logError("[api/competitions/[id]] PATCH error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถอัปเดตรายการแข่งขันได้" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireTeacherUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "รหัสรายการแข่งขันไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  try {
    const deletedCount = await withUserDb(auth.user.id, async (client) => {
      const res = await client.query(
        "DELETE FROM public.competitions WHERE id = $1",
        [id],
      );
      return res.rowCount ?? 0;
    });

    if (deletedCount === 0) {
      return NextResponse.json(
        { error: "ไม่พบรายการแข่งขันนี้" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError("[api/competitions/[id]] DELETE error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถลบรายการแข่งขันได้" },
      { status: 500 },
    );
  }
}
