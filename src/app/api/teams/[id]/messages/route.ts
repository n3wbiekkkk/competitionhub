import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser } from "@/lib/auth/cookies";
import { getAccessibleTeam, getTeamMentionables } from "@/lib/realtime/access";
import { extractMentionIds } from "@/lib/realtime/mentions";
import { createCollabNotifications } from "@/lib/realtime/notifications";
import type { TeamMessageItem } from "@/lib/realtime/types";
import { withUserDb } from "@/lib/db/pool";

export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();
const bodySchema = z.object({
  body: z.string().trim().min(1, "กรุณาพิมพ์ข้อความก่อนส่ง").max(2000, "ข้อความยาวเกิน 2,000 ตัวอักษร"),
});

interface MessageRow {
  id: string;
  team_id: string;
  author_id: string;
  author_name: string;
  nickname: string | null;
  body: string;
  mentions: string[];
  created_at: string;
}

function toMessage(row: MessageRow): TeamMessageItem {
  return {
    id: row.id,
    teamId: row.team_id,
    authorId: row.author_id,
    authorName: row.author_name,
    nickname: row.nickname,
    body: row.body,
    mentions: Array.isArray(row.mentions) ? row.mentions : [],
    createdAt: row.created_at,
  };
}

const MESSAGE_SELECT = `select m.id, m.team_id, m.author_id,
       p.full_name as author_name, p.nickname, m.body, m.mentions, m.created_at::text
from public.team_messages m
join public.profiles p on p.id = m.author_id`;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "รหัสทีมไม่ถูกต้อง" }, { status: 400 });
  }
  if (!(await getAccessibleTeam(auth.user.id, id))) {
    return NextResponse.json({ error: "คุณไม่มีสิทธิ์เข้าดูแชทของทีมนี้" }, { status: 403 });
  }

  const messages = await withUserDb(auth.user.id, async (client) => {
    const result = await client.query<MessageRow>(
      `${MESSAGE_SELECT} where m.team_id = $1 order by m.created_at asc limit 200`,
      [id],
    );
    return result.rows.map(toMessage);
  });
  return NextResponse.json({ messages });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "รหัสทีมไม่ถูกต้อง" }, { status: 400 });
  }
  const team = await getAccessibleTeam(auth.user.id, id);
  if (!team) {
    return NextResponse.json({ error: "คุณไม่มีสิทธิ์ส่งข้อความในทีมนี้" }, { status: 403 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  const members = await getTeamMentionables(auth.user.id, id);
  const mentionIds = extractMentionIds(parsed.data.body, members).filter(
    (memberId) => memberId !== auth.user.id,
  );
  const preview = parsed.data.body.length > 180
    ? `${parsed.data.body.slice(0, 179)}…`
    : parsed.data.body;

  const inserted = await withUserDb(auth.user.id, async (client) => {
    const result = await client.query<{
      id: string;
      created_at: string;
    }>(
      `insert into public.team_messages (team_id, author_id, body, mentions)
       values ($1, $2, $3, $4::uuid[])
       returning id, created_at::text`,
      [id, auth.user.id, parsed.data.body, mentionIds],
    );
    return result.rows[0] ?? null;
  });

  if (!inserted) {
    return NextResponse.json({ error: "ไม่สามารถส่งข้อความได้" }, { status: 500 });
  }

  await createCollabNotifications(
    mentionIds.map((userId) => ({
      userId,
      kind: "team_mention",
      title: `มีคนกล่าวถึงคุณในทีม ${team.name}`,
      body: preview,
      href: `/my-teams#team-${id}`,
      dedupeKey: `team_message:${inserted.id}:${userId}`,
    })),
  );

  const message: TeamMessageItem = {
    id: inserted.id,
    teamId: id,
    authorId: auth.user.id,
    authorName: auth.user.full_name,
    nickname: auth.user.nickname,
    body: parsed.data.body,
    mentions: mentionIds,
    createdAt: inserted.created_at,
  };
  return NextResponse.json({ message }, { status: 201 });
}
