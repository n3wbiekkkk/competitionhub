import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacherUser } from "@/lib/auth/cookies";
import { teamStatusSchema } from "@/lib/constants/tech-taxonomy";
import { withUserDb } from "@/lib/db/pool";
import {
  loadTeamBuilderData,
  queryCompetitionTeams,
} from "@/lib/db/team-builder";
import { logError } from "@/lib/utils/logger";

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const uuidSchema = z.string().uuid();

const syncTeamsSchema = z.object({
  teams: z.array(
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().trim().min(1, "กรุณาระบุชื่อทีม").max(120),
      advisor_id: z.string().uuid().nullable().optional(),
      status: teamStatusSchema.default("draft"),
      members: z.array(
        z.object({
          user_id: z.string().uuid(),
          assigned_role: z.string().trim().min(1).max(60),
        }),
      ),
    }),
  ),
});

export async function GET(
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
    const payload = await withUserDb(auth.user.id, (client) =>
      loadTeamBuilderData(client, id),
    );

    if (!payload) {
      return NextResponse.json(
        { error: "ไม่พบรายการแข่งขันนี้" },
        { status: 404 },
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    logError("[api/teacher/competitions/[id]/teams] GET error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถโหลดข้อมูลกระดานจัดทีมได้" },
      { status: 500 },
    );
  }
}

export async function PUT(
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

  const parsed = syncTeamsSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "ข้อมูลทีมไม่ถูกต้อง";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  // Ensure a student is not assigned to multiple teams in the same competition
  const seenStudents = new Set<string>();
  for (const team of parsed.data.teams) {
    for (const member of team.members) {
      if (seenStudents.has(member.user_id)) {
        return NextResponse.json(
          {
            error:
              "ไม่สามารถจัดนักเรียนคนเดียวกันซ้ำหลายทีมในรายการเดียวกันได้",
          },
          { status: 400 },
        );
      }
      seenStudents.add(member.user_id);
    }
  }

  try {
    const updatedTeams = await withUserDb(auth.user.id, async (client) => {
      const compCheck = await client.query<{
        id: string;
        min_size: number;
        max_size: number;
      }>(
        "SELECT id, min_size, max_size FROM public.competitions WHERE id = $1 LIMIT 1",
        [id],
      );
      const competition = compCheck.rows[0];
      if (!competition) {
        return null;
      }

      const [advisorRes, interestedRes] = await Promise.all([
        client.query<{ id: string }>(
          "SELECT id FROM public.profiles WHERE role = 'teacher'",
        ),
        client.query<{ user_id: string }>(
          "SELECT user_id FROM public.interests WHERE competition_id = $1",
          [id],
        ),
      ]);
      const advisorIds = new Set(advisorRes.rows.map((r) => r.id));
      const interestedIds = new Set(interestedRes.rows.map((r) => r.user_id));

      const existingRes = await client.query<{ id: string }>(
        "SELECT id FROM public.teams WHERE competition_id = $1",
        [id],
      );
      const existingIds = new Set(existingRes.rows.map((r) => r.id));

      const retainedIds = parsed.data.teams
        .map((t) => t.id)
        .filter((tid): tid is string => Boolean(tid && existingIds.has(tid)));

      if (retainedIds.length > 0) {
        await client.query(
          "DELETE FROM public.teams WHERE competition_id = $1 AND NOT (id = ANY($2::uuid[]))",
          [id, retainedIds],
        );
      } else {
        await client.query(
          "DELETE FROM public.teams WHERE competition_id = $1",
          [id],
        );
      }

      for (const team of parsed.data.teams) {
        const teamName = team.name.trim() || "Team";
        const status = team.status;
        const memberIds = team.members.map((m) => m.user_id);

        const advisorId = team.advisor_id ?? auth.user.id;
        let teamId: string;

        if (status === "confirmed") {
          if (
            team.members.length < competition.min_size ||
            team.members.length > competition.max_size
          ) {
            throw new HttpError(
              400,
              `ทีม “${teamName}” ต้องมีสมาชิก ${competition.min_size}–${competition.max_size} คนก่อนยืนยัน`,
            );
          }
          if (team.members.length === 0) {
            throw new HttpError(400, `ทีม “${teamName}” ต้องมีสมาชิกอย่างน้อย 1 คน`);
          }
        }

        if (!advisorIds.has(advisorId)) {
          throw new HttpError(400, `อาจารย์ที่ปรึกษาของทีม “${teamName}” ไม่ถูกต้อง`);
        }

        for (const memberId of memberIds) {
          if (!interestedIds.has(memberId)) {
            throw new HttpError(
              400,
              `สมาชิกในทีม “${teamName}” ต้องเป็นผู้ลงชื่อสนใจรายการนี้ก่อน`,
            );
          }
        }

        if (team.id && existingIds.has(team.id)) {
          await client.query(
            `UPDATE public.teams
             SET name = $1,
                 advisor_id = $2,
                 status = $3
             WHERE id = $4 AND competition_id = $5`,
            [teamName, advisorId, team.status, team.id, id],
          );
          teamId = team.id;
        } else {
          const insertRes = await client.query<{ id: string }>(
            `INSERT INTO public.teams (competition_id, name, advisor_id, status)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [id, teamName, advisorId, team.status],
          );
          const createdId = insertRes.rows[0]?.id;
          if (!createdId) {
            throw new Error("Failed to insert team");
          }
          teamId = createdId;
        }

        await client.query(
          "DELETE FROM public.team_members WHERE team_id = $1",
          [teamId],
        );

        for (const member of team.members) {
          await client.query(
            `INSERT INTO public.team_members (team_id, user_id, assigned_role)
             VALUES ($1, $2, $3)`,
            [teamId, member.user_id, member.assigned_role],
          );
        }
      }

      return queryCompetitionTeams(client, id);
    });

    if (!updatedTeams) {
      return NextResponse.json(
        { error: "ไม่พบรายการแข่งขันนี้" },
        { status: 404 },
      );
    }

    return NextResponse.json({ teams: updatedTeams });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "check_violation"
    ) {
      return NextResponse.json(
        { error: "จำนวนสมาชิกของทีมไม่ตรงกับที่รายการแข่งขันกำหนด" },
        { status: 400 },
      );
    }
    logError("[api/teacher/competitions/[id]/teams] PUT error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถบันทึกการจัดทีมได้" },
      { status: 500 },
    );
  }
}
