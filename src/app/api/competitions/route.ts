import { NextResponse } from "next/server";
import { z } from "zod";
import { extractTechCompetitionFromText } from "@/lib/ai/extract-competition";
import { getAuthenticatedProfile, requireAuthUser } from "@/lib/auth/cookies";
import {
  competitionSourceTypeSchema,
  competitionStatusSchema,
  isCompetitionStatus,
  isTechCategory,
  techCategorySchema,
  type UserRole,
} from "@/lib/constants/tech-taxonomy";
import { withUserDb } from "@/lib/db/pool";
import { normalizeToIsoCeDate } from "@/lib/utils/thai-date";
import type { Competition } from "@/types/database";
import { logError } from "@/lib/utils/logger";

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

const createCompetitionSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "กรุณากรอกชื่อรายการแข่งขันอย่างน้อย 3 ตัวอักษร")
      .max(200, "ชื่อรายการยาวเกินไป"),
    category: techCategorySchema,
    deadline: z.string().nullable().optional(),
    min_size: z.coerce.number().int().min(1).max(20).default(1),
    max_size: z.coerce.number().int().min(1).max(20).default(4),
    recommended_roles: z.array(z.string().trim().min(1).max(50)).default([]),
    tech_stack_hints: z
      .array(z.string().trim().min(1).max(50))
      .max(15)
      .default([]),
    eligibility: z.string().trim().max(500).nullable().optional(),
    summary: z
      .string()
      .trim()
      .min(5, "กรุณากรอกรายละเอียดโดยสรุป")
      .max(4000),
    source_url: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .optional()
      .refine(isValidOptionalHttpUrl, {
        message: "ลิงก์แหล่งที่มาต้องขึ้นต้นด้วย http:// หรือ https://",
      }),
    source_type: competitionSourceTypeSchema.default("ai_link"),
    status: competitionStatusSchema.optional(),
    is_tech_related: z.boolean().default(true),
    teacher_override: z.boolean().default(false),
  })
  .refine((val) => val.max_size >= val.min_size, {
    message: "จำนวนสมาชิกสูงสุดต้องมากกว่าหรือเท่ากับจำนวนสมาชิกขั้นต่ำ",
  });

export interface CompetitionListItem extends Competition {
  interest_count: number;
  my_preferred_role: string | null;
  submitter_role: UserRole | null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const categoryParam = searchParams.get("category");
  const queryParam = searchParams.get("q")?.trim() ?? "";

  const user = await getAuthenticatedProfile();

  try {
    const items = await withUserDb(user?.id ?? null, async (client) => {
      const clauses: string[] = [];
      const values: unknown[] = [];

      if (statusParam && statusParam !== "all" && isCompetitionStatus(statusParam)) {
        values.push(statusParam);
        clauses.push(`c.status = $${values.length}`);
      }

      if (categoryParam && categoryParam !== "all" && isTechCategory(categoryParam)) {
        values.push(categoryParam);
        clauses.push(`c.category = $${values.length}`);
      }

      if (queryParam.length > 0) {
        values.push(`%${queryParam}%`);
        clauses.push(
          `(c.title ILIKE $${values.length} OR COALESCE(c.summary, '') ILIKE $${values.length} OR COALESCE(c.eligibility, '') ILIKE $${values.length} OR array_to_string(c.tech_stack_hints, ' ') ILIKE $${values.length})`,
        );
      }

      const whereSql =
        clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

      const compRes = await client.query<Competition>(
        `SELECT c.id, c.title, c.category, c.deadline::text, c.min_size, c.max_size,
                c.recommended_roles, c.tech_stack_hints, c.eligibility, c.summary,
                c.source_url, c.source_type, c.status, c.created_by,
                c.created_at::text, c.updated_at::text
         FROM public.competitions c
         ${whereSql}
         ORDER BY c.deadline ASC NULLS LAST, c.created_at DESC`,
        values,
      );

      const competitions = compRes.rows;
      if (competitions.length === 0) {
        return [] satisfies CompetitionListItem[];
      }

      const ids = competitions.map((c) => c.id);
      const countRes = await client.query<{
        competition_id: string;
        interest_count: string;
      }>(
        `SELECT competition_id, interest_count::text
         FROM public.get_competition_interest_counts($1::uuid[])`,
        [ids],
      );
      const countMap = new Map<string, number>();
      for (const row of countRes.rows) {
        countMap.set(row.competition_id, Number(row.interest_count));
      }

      const myInterestMap = new Map<string, string>();
      if (user) {
        const myRes = await client.query<{
          competition_id: string;
          preferred_role: string;
        }>(
          `SELECT competition_id, preferred_role
           FROM public.interests
           WHERE user_id = $1 AND competition_id = ANY($2::uuid[])`,
          [user.id, ids],
        );
        for (const row of myRes.rows) {
          myInterestMap.set(row.competition_id, row.preferred_role);
        }
      }

      const submitterRoleMap = new Map<string, UserRole>();
      if (user?.role === "teacher") {
        const creatorIds = Array.from(
          new Set(
            competitions
              .map((c) => c.created_by)
              .filter((id): id is string => Boolean(id)),
          ),
        );
        if (creatorIds.length > 0) {
          const creatorRes = await client.query<{
            id: string;
            role: UserRole;
          }>(
            `SELECT id, role
             FROM public.profiles
             WHERE id = ANY($1::uuid[])`,
            [creatorIds],
          );
          for (const row of creatorRes.rows) {
            submitterRoleMap.set(row.id, row.role);
          }
        }
      }

      return competitions.map((comp) => ({
        ...comp,
        interest_count: countMap.get(comp.id) ?? 0,
        my_preferred_role: myInterestMap.get(comp.id) ?? null,
        submitter_role: comp.created_by
          ? (submitterRoleMap.get(comp.created_by) ?? null)
          : null,
      }));
    });

    return NextResponse.json({ competitions: items });
  } catch (error) {
    logError("[api/competitions] GET error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถโหลดรายการแข่งขันได้" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
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

  const parsed = createCompetitionSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "ข้อมูลไม่ครบถ้วน";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const data = parsed.data;
  const isTeacher = auth.user.role === "teacher";

  if (!data.is_tech_related) {
    if (auth.user.role !== "teacher") {
      return NextResponse.json(
        {
          error:
            "รายการนี้อาจไม่ใช่สายคอมพิวเตอร์/เทคโนโลยี ระบบไม่อนุญาตให้นักเรียนส่งรายการนอกสาย Tech",
        },
        { status: 403 },
      );
    }
    if (!data.teacher_override) {
      return NextResponse.json(
        {
          error:
            "กรุณาเปิดสวิตช์ยืนยันสำหรับอาจารย์หากต้องการบันทึกรายการที่ AI แจ้งเตือน",
        },
        { status: 400 },
      );
    }
  }

  if (!isTeacher) {
    let verifiedRelated = false;
    try {
      const verification = await extractTechCompetitionFromText(
        [data.title, data.summary, data.eligibility ?? ""].join("\n"),
        data.source_url ?? null,
        { thailandOnly: true },
      );
      verifiedRelated = verification.is_tech_related;
    } catch {
      verifiedRelated = false;
    }
    if (!verifiedRelated) {
      return NextResponse.json(
        {
          error:
            "ไม่ยืนยันได้ว่ารายการนี้เป็นการแข่งขันสายคอมพิวเตอร์/เทคโนโลยีในประเทศไทย กรุณาตรวจสอบข้อมูลอีกครั้ง",
        },
        { status: 403 },
      );
    }
  }

  const finalStatus = isTeacher ? (data.status ?? "open") : "pending_review";
  const finalSourceType = isTeacher
    ? data.source_type
    : data.source_type === "ai_poster"
      ? "ai_poster"
      : "ai_link";
  const normalizedDeadline = normalizeToIsoCeDate(data.deadline ?? null);
  const sourceUrl = data.source_url?.trim() || null;
  const eligibility = data.eligibility?.trim() || null;

  const recommendedRoles = Array.from(
    new Set(data.recommended_roles.map((r) => r.trim()).filter(Boolean)),
  );
  const techStackHints = Array.from(
    new Set(data.tech_stack_hints.map((t) => t.trim()).filter(Boolean)),
  );

  try {
    const created = await withUserDb(auth.user.id, async (client) => {
      const result = await client.query<Competition>(
        `INSERT INTO public.competitions (
           title, category, deadline, min_size, max_size,
           recommended_roles, tech_stack_hints, eligibility, summary,
           source_url, source_type, status, created_by
         )
         VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id, title, category, deadline::text, min_size, max_size,
                   recommended_roles, tech_stack_hints, eligibility, summary,
                   source_url, source_type, status, created_by,
                   created_at::text, updated_at::text`,
        [
          data.title,
          data.category,
          normalizedDeadline,
          data.min_size,
          data.max_size,
          recommendedRoles,
          techStackHints,
          eligibility,
          data.summary,
          sourceUrl,
          finalSourceType,
          finalStatus,
          auth.user.id,
        ],
      );
      return result.rows[0];
    });

    return NextResponse.json({ competition: created }, { status: 201 });
  } catch (error) {
    const pgCode =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : null;

    if (pgCode === "23505") {
      return NextResponse.json(
        { error: "รายการแข่งขันที่มีลิงก์นี้มีอยู่ในระบบแล้ว" },
        { status: 409 },
      );
    }

    logError("[api/competitions] POST error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถบันทึกรายการแข่งขันได้" },
      { status: 500 },
    );
  }
}
