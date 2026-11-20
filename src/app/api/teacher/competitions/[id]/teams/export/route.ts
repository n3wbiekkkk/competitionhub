import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacherUser } from "@/lib/auth/cookies";
import { withUserDb } from "@/lib/db/pool";

const uuidSchema = z.string().uuid();

function escapeCsvCell(rawValue: string | null | undefined): string {
  const value = (rawValue ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const formulaSafe = /^[=+\-@\t]/.test(value) ? `'${value}` : value;
  const escaped = formulaSafe.replace(/"/g, '""');
  return `"${escaped}"`;
}

interface CsvMemberRow {
  team_name: string;
  student_name: string;
  nickname: string | null;
  grade: string | null;
  assigned_role: string;
  skills: string[];
  github_url: string | null;
  contact: string | null;
  email: string;
}

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
    const data = await withUserDb(auth.user.id, async (client) => {
      const compRes = await client.query<{ title: string }>(
        "SELECT title FROM public.competitions WHERE id = $1 LIMIT 1",
        [id],
      );
      const comp = compRes.rows[0];
      if (!comp) return null;

      const rowsRes = await client.query<CsvMemberRow>(
        `SELECT t.name AS team_name,
                p.full_name AS student_name,
                p.nickname,
                p.grade,
                tm.assigned_role,
                p.skills,
                p.github_url,
                p.contact,
                p.email
         FROM public.teams t
         JOIN public.team_members tm ON tm.team_id = t.id
         JOIN public.profiles p ON p.id = tm.user_id
         WHERE t.competition_id = $1
         ORDER BY t.created_at ASC, t.name ASC, p.full_name ASC`,
        [id],
      );

      return { title: comp.title, rows: rowsRes.rows };
    });

    if (!data) {
      return NextResponse.json(
        { error: "ไม่พบรายการแข่งขันนี้" },
        { status: 404 },
      );
    }

    const header = [
      "Team Name",
      "Student Name",
      "Nickname",
      "Grade",
      "Assigned Role",
      "Skills",
      "GitHub",
      "Contact",
      "Email",
    ].join(",");

    const lines = data.rows.map((row) =>
      [
        escapeCsvCell(row.team_name),
        escapeCsvCell(row.student_name),
        escapeCsvCell(row.nickname ?? ""),
        escapeCsvCell(row.grade ?? ""),
        escapeCsvCell(row.assigned_role),
        escapeCsvCell(row.skills.join("; ")),
        escapeCsvCell(row.github_url ?? ""),
        escapeCsvCell(row.contact ?? ""),
        escapeCsvCell(row.email),
      ].join(","),
    );

    const csvBody = `\uFEFF${[header, ...lines].join("\r\n")}`;
    const safeSlug =
      data.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "competition";

    return new NextResponse(csvBody, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="teams-${safeSlug}.csv"`,
      },
    });
  } catch (error) {
    console.error("[api/teacher/competitions/[id]/teams/export] error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถส่งออกไฟล์ CSV ได้" },
      { status: 500 },
    );
  }
}
