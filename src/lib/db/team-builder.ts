import type { PoolClient } from "pg";
import type { TeamStatus } from "@/lib/constants/tech-taxonomy";
import type { Competition } from "@/types/database";

export interface InterestedStudentItem {
  user_id: string;
  full_name: string;
  nickname: string | null;
  email: string;
  grade: string | null;
  skills: string[];
  contact: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  preferred_role: string;
  note: string | null;
  interest_created_at: string;
}

export interface TeamMemberDetail {
  user_id: string;
  assigned_role: string;
  full_name: string;
  nickname: string | null;
  email: string;
  grade: string | null;
  skills: string[];
  contact: string | null;
  github_url: string | null;
  portfolio_url: string | null;
}

export interface TeamDetail {
  id: string;
  competition_id: string;
  name: string;
  advisor_id: string | null;
  status: TeamStatus;
  created_at: string;
  members: TeamMemberDetail[];
}

export interface TeacherOption {
  id: string;
  full_name: string;
  email: string;
}

export interface TeamBuilderPayload {
  competition: Competition;
  interestedStudents: InterestedStudentItem[];
  teams: TeamDetail[];
  teachers: TeacherOption[];
}

interface RawTeamRow {
  id: string;
  competition_id: string;
  name: string;
  advisor_id: string | null;
  status: TeamStatus;
  created_at: string;
}

interface RawMemberRow extends TeamMemberDetail {
  team_id: string;
}

export async function queryCompetitionTeams(
  client: PoolClient,
  competitionId: string,
): Promise<TeamDetail[]> {
  const teamRes = await client.query<RawTeamRow>(
    `SELECT id, competition_id, name, advisor_id, status, created_at::text
     FROM public.teams
     WHERE competition_id = $1
     ORDER BY created_at ASC, name ASC`,
    [competitionId],
  );

  const teamIds = teamRes.rows.map((t) => t.id);
  const membersMap = new Map<string, TeamMemberDetail[]>();

  if (teamIds.length > 0) {
    const memberRes = await client.query<RawMemberRow>(
      `SELECT tm.team_id, tm.user_id, tm.assigned_role,
              p.full_name, p.nickname, p.email, p.grade, p.skills,
              p.contact, p.github_url, p.portfolio_url
       FROM public.team_members tm
       JOIN public.profiles p ON p.id = tm.user_id
       WHERE tm.team_id = ANY($1::uuid[])
       ORDER BY p.full_name ASC`,
      [teamIds],
    );

    for (const row of memberRes.rows) {
      const list = membersMap.get(row.team_id) ?? [];
      list.push({
        user_id: row.user_id,
        assigned_role: row.assigned_role,
        full_name: row.full_name,
        nickname: row.nickname,
        email: row.email,
        grade: row.grade,
        skills: row.skills,
        contact: row.contact,
        github_url: row.github_url,
        portfolio_url: row.portfolio_url,
      });
      membersMap.set(row.team_id, list);
    }
  }

  return teamRes.rows.map((team) => ({
    ...team,
    members: membersMap.get(team.id) ?? [],
  }));
}

export async function loadTeamBuilderData(
  client: PoolClient,
  competitionId: string,
): Promise<TeamBuilderPayload | null> {
  const compRes = await client.query<Competition>(
    `SELECT id, title, category, deadline::text, min_size, max_size,
            recommended_roles, tech_stack_hints, eligibility, summary,
            source_url, source_type, status, created_by,
            created_at::text, updated_at::text
     FROM public.competitions
     WHERE id = $1
     LIMIT 1`,
    [competitionId],
  );

  const competition = compRes.rows[0];
  if (!competition) {
    return null;
  }

  const [studentsRes, teams, teachersRes] = await Promise.all([
    client.query<InterestedStudentItem>(
      `SELECT i.user_id, p.full_name, p.nickname, p.email, p.grade, p.skills,
              p.contact, p.github_url, p.portfolio_url,
              i.preferred_role, i.note, i.created_at::text AS interest_created_at
       FROM public.interests i
       JOIN public.profiles p ON p.id = i.user_id
       WHERE i.competition_id = $1
       ORDER BY i.created_at ASC`,
      [competitionId],
    ),
    queryCompetitionTeams(client, competitionId),
    client.query<TeacherOption>(
      `SELECT id, full_name, email
       FROM public.profiles
       WHERE role = 'teacher'
       ORDER BY full_name ASC`,
    ),
  ]);

  return {
    competition,
    interestedStudents: studentsRes.rows,
    teams,
    teachers: teachersRes.rows,
  };
}
