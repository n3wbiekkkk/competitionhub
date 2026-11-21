import { z } from "zod";
import { withSystemDb, withUserDb } from "@/lib/db/pool";
import { normalizeCursor } from "./cursor";
import { realtimeEventSchema, taskStatusSchema, riskLevelSchema, type RealtimeEvent } from "./types";

const MAX_EVENTS_PER_SOURCE = 20;
const MAX_EVENTS_TOTAL = 50;

const notificationRowSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  body: z.string().nullable(),
  href: z.string().nullable(),
  created_at: z.string(),
});

const messageRowSchema = z.object({
  id: z.string().uuid(),
  team_id: z.string().uuid(),
  author_id: z.string().uuid(),
  preview: z.string(),
  created_at: z.string(),
});

const taskRowSchema = z.object({
  id: z.string().uuid(),
  team_id: z.string().uuid(),
  task_id: z.string().uuid(),
  title: z.string(),
  status: taskStatusSchema,
  created_at: z.string(),
});

const checkinRowSchema = z.object({
  id: z.string().uuid(),
  team_id: z.string().uuid(),
  checkin_id: z.string().uuid(),
  risk_level: riskLevelSchema,
  created_at: z.string(),
});

function toIso(raw: string): string | null {
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

type TimestampedEvent = Extract<RealtimeEvent, { createdAt: string }>;

function parseRows<TRow extends { created_at: string }>(
  schema: z.ZodType<TRow>,
  rows: readonly unknown[],
  build: (value: TRow, createdAt: string) => TimestampedEvent | null,
): TimestampedEvent[] {
  const events: TimestampedEvent[] = [];
  for (const row of rows) {
    const parsed = schema.safeParse(row);
    if (!parsed.success) continue;
    const createdAt = toIso(parsed.data.created_at);
    if (!createdAt) continue;
    const event = build(parsed.data, createdAt);
    if (event && realtimeEventSchema.safeParse(event).success) events.push(event);
  }
  return events;
}

export interface LoadRealtimeEventsOptions {
  userId: string;
  since?: string | null;
}

/** Scoped cursor read: notifications are system-only, collaboration rows use RLS. */
export async function loadRealtimeEvents({
  userId,
  since,
}: LoadRealtimeEventsOptions): Promise<{ events: RealtimeEvent[]; serverTime: string }> {
  const cursor = normalizeCursor(since);

  const notificationRows = await withSystemDb(async (client) => {
    const result = await client.query(
      `select id, title, body, href, created_at::text
       from public.notifications
       where user_id = $1 and created_at > $2::timestamptz
       order by created_at asc
       limit $3`,
      [userId, cursor, MAX_EVENTS_PER_SOURCE],
    );
    return result.rows;
  });

  const teamRows = await withUserDb(userId, async (client) => {
    const [messages, tasks, checkins] = await Promise.all([
      client.query(
        `select m.id, m.team_id, m.author_id, left(m.body, 180) as preview, m.created_at::text
         from public.team_messages m
         join public.teams t on t.id = m.team_id
         left join public.team_members tm
           on tm.team_id = t.id and tm.user_id = $1
         where t.status = 'confirmed'
           and m.created_at > $2::timestamptz
           and (tm.user_id is not null or t.advisor_id = $1 or public.is_teacher())
         order by m.created_at asc
         limit $3`,
        [userId, cursor, MAX_EVENTS_PER_SOURCE],
      ),
      client.query(
        `select task.id, task.team_id, task.id as task_id, task.title, task.status,
                task.created_at::text
         from public.team_tasks task
         join public.teams t on t.id = task.team_id
         left join public.team_members tm
           on tm.team_id = t.id and tm.user_id = $1
         where t.status = 'confirmed'
           and task.created_at > $2::timestamptz
           and (tm.user_id is not null or t.advisor_id = $1 or public.is_teacher())
         order by task.created_at asc
         limit $3`,
        [userId, cursor, MAX_EVENTS_PER_SOURCE],
      ),
      client.query(
        `select c.id, c.team_id, c.id as checkin_id, c.risk_level,
                greatest(c.created_at, c.updated_at)::text as created_at
         from public.team_checkins c
         join public.teams t on t.id = c.team_id
         left join public.team_members tm
           on tm.team_id = t.id and tm.user_id = $1
         where t.status = 'confirmed'
           and greatest(c.created_at, c.updated_at) > $2::timestamptz
           and (tm.user_id is not null or t.advisor_id = $1 or public.is_teacher())
         order by greatest(c.created_at, c.updated_at) asc
         limit $3`,
        [userId, cursor, MAX_EVENTS_PER_SOURCE],
      ),
    ]);
    return { messages: messages.rows, tasks: tasks.rows, checkins: checkins.rows };
  });

  const events: TimestampedEvent[] = [
    ...parseRows(notificationRowSchema, notificationRows, (row, createdAt) => ({
      kind: "notification",
      id: `notification:${row.id}`,
      userId,
      title: truncate(row.title, 200),
      body: row.body ? truncate(row.body, 500) : null,
      href: row.href ? truncate(row.href, 300) : null,
      createdAt,
    })),
    ...parseRows(messageRowSchema, teamRows.messages, (row, createdAt) => ({
      kind: "team_message",
      id: `message:${row.id}`,
      teamId: row.team_id,
      authorId: row.author_id,
      preview: truncate(row.preview, 180),
      createdAt,
    })),
    ...parseRows(taskRowSchema, teamRows.tasks, (row, createdAt) => ({
      kind: "team_task",
      id: `task:${row.id}`,
      teamId: row.team_id,
      taskId: row.task_id,
      title: truncate(row.title, 200),
      status: row.status,
      createdAt,
    })),
    ...parseRows(checkinRowSchema, teamRows.checkins, (row, createdAt) => ({
      kind: "team_checkin",
      id: `checkin:${row.id}`,
      teamId: row.team_id,
      checkinId: row.checkin_id,
      riskLevel: row.risk_level,
      createdAt,
    })),
  ];

  events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return { events: events.slice(0, MAX_EVENTS_TOTAL), serverTime: new Date().toISOString() };
}

/** Small helper used by write routes to keep notification hrefs internal. */
export function internalHref(path: string): string {
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}
