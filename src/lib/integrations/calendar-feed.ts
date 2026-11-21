import type { PoolClient } from "pg";
import { TECH_CATEGORY_META, type TechCategory } from "@/lib/constants/tech-taxonomy";
import { formatThaiDate } from "@/lib/utils/thai-date";
import type { CalendarEventInput } from "./calendar";

interface BookmarkRow {
  id: string;
  title: string;
  deadline: string;
  category: string;
}

interface InterestRow {
  id: string;
  title: string;
  deadline: string;
  category: string;
  preferred_role: string;
}

interface TaskRow {
  id: string;
  title: string;
  due_date: string;
  team_name: string;
  competition_title: string;
}

function categoryLabel(category: string): string {
  const known = TECH_CATEGORY_META[category as TechCategory];
  return known?.shortLabel ?? category;
}

/**
 * Loads the three event groups exposed by a calendar subscription.
 * The caller has already checked the bearer token; every query is then run
 * with the token owner's RLS context.
 */
export async function loadCalendarEvents(
  client: PoolClient,
  userId: string,
  siteOrigin: string,
): Promise<CalendarEventInput[]> {
  const [bookmarks, interests, tasks] = await Promise.all([
    client.query<BookmarkRow>(
      `select c.id, c.title, c.deadline::text, c.category
       from public.competition_bookmarks b
       join public.competitions c on c.id = b.competition_id
       where b.user_id = $1 and c.deadline is not null and c.status = 'open'`,
      [userId],
    ),
    client.query<InterestRow>(
      `select c.id, c.title, c.deadline::text, c.category, i.preferred_role
       from public.interests i
       join public.competitions c on c.id = i.competition_id
       where i.user_id = $1 and c.deadline is not null and c.status = 'open'`,
      [userId],
    ),
    client.query<TaskRow>(
      `select tt.id, tt.title, tt.due_date::text, t.name as team_name,
              c.title as competition_title
       from public.team_tasks tt
       join public.team_members tm on tm.team_id = tt.team_id and tm.user_id = $1
       join public.teams t on t.id = tt.team_id and t.status = 'confirmed'
       join public.competitions c on c.id = t.competition_id
       where tt.assignee_id = $1 and tt.due_date is not null and tt.status <> 'done'`,
      [userId],
    ),
  ]);

  const events: CalendarEventInput[] = [];

  for (const row of bookmarks.rows) {
    events.push({
      uid: `bookmark-${row.id}@techcomp-hub`,
      title: `ปิดรับสมัคร: ${row.title}`,
      startDate: row.deadline,
      description: `การแข่งขันที่คุณบันทึกไว้ · ${categoryLabel(row.category)} · ${formatThaiDate(row.deadline, "long")}`,
      url: new URL(`/competitions/${row.id}`, siteOrigin).toString(),
      categories: ["competition", categoryLabel(row.category)],
    });
  }

  for (const row of interests.rows) {
    events.push({
      uid: `interest-${row.id}@techcomp-hub`,
      title: `กำหนดส่งผลงาน: ${row.title}`,
      startDate: row.deadline,
      description: `คุณแสดงความสนใจในตำแหน่ง ${row.preferred_role} · ${formatThaiDate(row.deadline, "long")}`,
      url: new URL(`/competitions/${row.id}`, siteOrigin).toString(),
      categories: ["interest", categoryLabel(row.category)],
    });
  }

  for (const row of tasks.rows) {
    events.push({
      uid: `task-${row.id}@techcomp-hub`,
      title: `งานทีม: ${row.title}`,
      startDate: row.due_date,
      description: `ทีม ${row.team_name} · ${row.competition_title} · กำหนดถึง ${formatThaiDate(row.due_date, "long")}`,
      url: new URL("/my-teams", siteOrigin).toString(),
      categories: ["team-task"],
    });
  }

  return events.sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title, "th"),
  );
}
