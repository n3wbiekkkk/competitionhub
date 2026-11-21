import type { PoolClient } from "pg";
import { z } from "zod";
import { techRoleSchema } from "@/lib/constants/tech-taxonomy";
import { withSystemDb } from "@/lib/db/pool";
import { getTodayIsoBangkok } from "@/lib/utils/thai-date";
import {
  rankTeammates,
  teamFormationModeSchema,
  type DirectoryCandidate,
  type StudentTeamInvitation,
  type StudentTeamOpenRole,
  type StudentTeamsPayload,
  type StudentTeamSummary,
} from "@/lib/utils/teammate-match";

export const createStudentTeamSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "กรุณาระบุชื่อทีมอย่างน้อย 2 ตัวอักษร")
    .max(120),
  role: techRoleSchema,
});

export const invitePeerSchema = z.object({
  target_user_id: z.string().uuid(),
  role: techRoleSchema,
  open_role_id: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export const joinRoleRequestSchema = z.object({
  note: z.string().trim().max(500).nullable().optional(),
});

export const invitationActionSchema = z.object({
  action: z.enum(["accept", "decline", "revoke"]),
});

export const openRoleCreateSchema = z.object({
  role: techRoleSchema,
  slots: z.number().int().min(1).max(10).default(1),
  note: z.string().trim().max(500).nullable().optional(),
});

export const openRoleUpdateSchema = z
  .object({
    role_id: z.string().uuid(),
    role: techRoleSchema.optional(),
    slots: z.number().int().min(1).max(10).optional(),
    status: z.enum(["open", "paused", "closed"]).optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine(
    (value) =>
      value.role !== undefined ||
      value.slots !== undefined ||
      value.status !== undefined ||
      value.note !== undefined,
    { message: "ต้องระบุข้อมูลที่ต้องการแก้ไขอย่างน้อยหนึ่งรายการ" },
  );

export const teacherControlSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set_mode"),
    team_formation_mode: teamFormationModeSchema,
  }),
  z.object({
    action: z.literal("approve"),
    team_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("lock"),
    team_id: z.string().uuid(),
    locked: z.boolean(),
  }),
]);

export type TeacherControlInput = z.infer<typeof teacherControlSchema>;
export type InvitationAction = z.infer<typeof invitationActionSchema>["action"];

export class StudentTeamError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "StudentTeamError";
  }
}

type CompetitionStatus = "pending_review" | "open" | "closed" | "rejected";
type TeamStatus = "draft" | "confirmed";
type InvitationDirection = "team_invite" | "join_request";
type InvitationStatus = "pending" | "accepted" | "declined" | "revoked" | "expired";
type OpenRoleStatus = "open" | "paused" | "closed";

interface CompetitionRow {
  id: string;
  title: string;
  deadline: string | null;
  min_size: number;
  max_size: number;
  status: CompetitionStatus;
  team_formation_mode: "teacher" | "student" | "hybrid";
  recommended_roles: string[];
  tech_stack_hints: string[];
}

interface TeamRow {
  id: string;
  competition_id: string;
  name: string;
  status: TeamStatus;
  created_by: string | null;
  teacher_approved: boolean;
  recruitment_locked: boolean;
  created_at: string;
}

interface MemberRow {
  team_id: string;
  user_id: string;
  assigned_role: string;
  full_name: string;
  nickname: string | null;
  grade: string | null;
  skills: string[];
  is_owner: boolean;
}

interface OpenRoleRow {
  id: string;
  team_id: string;
  role: string;
  slots: number;
  status: OpenRoleStatus;
  note: string | null;
  taken: number;
}

interface OpenRoleListingRow extends OpenRoleRow {
  team_name: string;
}

interface InvitationRow {
  id: string;
  team_id: string;
  direction: InvitationDirection;
  sender_id: string;
  recipient_id: string;
  open_role_id: string | null;
  role: string;
  note: string | null;
  status: InvitationStatus;
  created_at: string;
  responded_at: string | null;
}

interface CandidateRow {
  id: string;
  full_name: string;
  nickname: string | null;
  grade: string | null;
  skills: string[];
  preferred_role: string | null;
}

interface ManagedTeamRow {
  id: string;
  competition_id: string;
  created_by: string | null;
  recruitment_open: boolean;
}

interface AcceptRow extends InvitationRow {
  team_name: string;
  competition_id: string;
  competition_title: string;
  team_status: TeamStatus;
  recruitment_locked: boolean;
  formation_source: "teacher" | "student";
  competition_status: CompetitionStatus;
  max_size: number;
  deadline: string | null;
  team_formation_mode: "teacher" | "student" | "hybrid";
  open_role_status: OpenRoleStatus | null;
  open_role_slots: number | null;
  open_role_role: string | null;
  open_role_taken: number;
}

export interface RecruitmentNoticeInput {
  event: "invite" | "request" | "accepted";
  invitation_id: string;
  team_id: string;
  competition_id: string;
  competition_title: string;
  team_name: string;
  role: string;
  sender_id: string;
  recipient_id: string;
}

export interface InvitationResolution {
  invitation: StudentTeamInvitation;
  notice: RecruitmentNoticeInput | null;
}

function mapMember(row: MemberRow) {
  return {
    user_id: row.user_id,
    full_name: row.full_name,
    nickname: row.nickname,
    grade: row.grade,
    skills: row.skills,
    assigned_role: row.assigned_role,
    is_owner: row.is_owner,
  };
}

function mapOpenRole(row: OpenRoleRow): StudentTeamOpenRole {
  return {
    id: row.id,
    team_id: row.team_id,
    role: row.role,
    slots: row.slots,
    taken: row.taken,
    status: row.status,
    note: row.note,
  };
}

function mapInvitation(row: InvitationRow): StudentTeamInvitation {
  return {
    id: row.id,
    team_id: row.team_id,
    direction: row.direction,
    sender_id: row.sender_id,
    recipient_id: row.recipient_id,
    open_role_id: row.open_role_id,
    role: row.role,
    note: row.note,
    status: row.status,
    created_at: row.created_at,
    responded_at: row.responded_at,
  };
}

function mapCandidate(row: CandidateRow): DirectoryCandidate {
  return {
    user_id: row.id,
    full_name: row.full_name,
    nickname: row.nickname,
    grade: row.grade,
    skills: row.skills,
    preferred_role: row.preferred_role,
  };
}

function mapTeam(
  row: TeamRow,
  members: MemberRow[],
  roles: OpenRoleRow[],
  invitations: InvitationRow[],
): StudentTeamSummary {
  return {
    id: row.id,
    competition_id: row.competition_id,
    name: row.name,
    status: row.status,
    created_by: row.created_by,
    teacher_approved: row.teacher_approved,
    recruitment_locked: row.recruitment_locked,
    created_at: row.created_at,
    members: members.map(mapMember),
    open_roles: roles.map(mapOpenRole),
    invitations: invitations.map(mapInvitation),
  };
}

async function loadTeamSummaries(
  client: PoolClient,
  teamIds: string[],
): Promise<StudentTeamSummary[]> {
  if (teamIds.length === 0) return [];

  const teamRes = await client.query<TeamRow>(
    `SELECT id, competition_id, name, status, created_by,
            teacher_approved, recruitment_locked, created_at::text
     FROM public.teams
     WHERE id = ANY($1::uuid[])
     ORDER BY created_at DESC, name ASC`,
    [teamIds],
  );
  if (teamRes.rows.length === 0) return [];

  const [memberRes, roleRes, invitationRes] = await Promise.all([
    client.query<MemberRow>(
      `SELECT tm.team_id, tm.user_id, tm.assigned_role,
              p.full_name, p.nickname, p.grade, p.skills,
              (tm.user_id = t.created_by) AS is_owner
       FROM public.team_members tm
       JOIN public.teams t ON t.id = tm.team_id
       JOIN public.profiles p ON p.id = tm.user_id
       WHERE tm.team_id = ANY($1::uuid[])
       ORDER BY p.full_name ASC`,
      [teamIds],
    ),
    client.query<OpenRoleRow>(
      `SELECT id, team_id, role, slots, status, note,
              public.student_team_open_role_taken(id) AS taken
       FROM public.team_open_roles
       WHERE team_id = ANY($1::uuid[])
       ORDER BY created_at ASC, role ASC`,
      [teamIds],
    ),
    client.query<InvitationRow>(
      `SELECT id, team_id, direction, sender_id, recipient_id, open_role_id,
              role, note, status, created_at::text, responded_at::text
       FROM public.team_invitations
       WHERE team_id = ANY($1::uuid[])
       ORDER BY created_at DESC`,
      [teamIds],
    ),
  ]);

  const membersByTeam = new Map<string, MemberRow[]>();
  const rolesByTeam = new Map<string, OpenRoleRow[]>();
  const invitationsByTeam = new Map<string, InvitationRow[]>();

  for (const row of memberRes.rows) {
    const list = membersByTeam.get(row.team_id) ?? [];
    list.push(row);
    membersByTeam.set(row.team_id, list);
  }
  for (const row of roleRes.rows) {
    const list = rolesByTeam.get(row.team_id) ?? [];
    list.push(row);
    rolesByTeam.set(row.team_id, list);
  }
  for (const row of invitationRes.rows) {
    const list = invitationsByTeam.get(row.team_id) ?? [];
    list.push(row);
    invitationsByTeam.set(row.team_id, list);
  }

  return teamRes.rows.map((team) =>
    mapTeam(
      team,
      membersByTeam.get(team.id) ?? [],
      rolesByTeam.get(team.id) ?? [],
      invitationsByTeam.get(team.id) ?? [],
    ),
  );
}

function isStudentMode(mode: CompetitionRow["team_formation_mode"]): boolean {
  return mode === "student" || mode === "hybrid";
}

type EligibilityFields = Pick<
  CompetitionRow,
  "status" | "deadline" | "team_formation_mode"
>;

function assertEligibleCompetition(
  competition: EligibilityFields,
  todayIso: string,
): void {
  if (!isStudentMode(competition.team_formation_mode)) {
    throw new StudentTeamError(
      403,
      "รายการนี้เปิดให้อาจารย์จัดทีมเท่านั้น",
    );
  }
  if (competition.status !== "open") {
    throw new StudentTeamError(409, "รายการแข่งขันนี้ปิดรับสมัครแล้ว");
  }
  if (
    competition.deadline !== null &&
    competition.deadline < todayIso
  ) {
    throw new StudentTeamError(409, "ผ่านกำหนดปิดรับสมัครของรายการนี้แล้ว");
  }
}

async function assertTeamRecruitable(
  client: PoolClient,
  teamId: string,
): Promise<CompetitionRow> {
  const res = await client.query<CompetitionRow>(
    `SELECT c.id, c.title, c.deadline::text, c.min_size, c.max_size,
            c.status, c.team_formation_mode, c.recommended_roles, c.tech_stack_hints
     FROM public.teams t
     JOIN public.competitions c ON c.id = t.competition_id
     WHERE t.id = $1
       AND t.formation_source = 'student'
       AND t.status = 'draft'
       AND NOT t.recruitment_locked
     LIMIT 1`,
    [teamId],
  );
  const competition = res.rows[0];
  if (!competition) {
    throw new StudentTeamError(409, "ทีมนี้ไม่เปิดรับสมาชิกเพิ่มแล้ว");
  }
  assertEligibleCompetition(competition, getTodayIsoBangkok());
  return competition;
}

async function assertTeamOwner(
  client: PoolClient,
  teamId: string,
  userId: string,
): Promise<ManagedTeamRow> {
  const res = await client.query<ManagedTeamRow>(
    `SELECT t.id, t.competition_id, t.created_by,
            public.student_team_recruitment_open(t.id) AS recruitment_open
     FROM public.teams t
     WHERE t.id = $1
       AND t.formation_source = 'student'
     LIMIT 1`,
    [teamId],
  );
  const team = res.rows[0];
  if (!team || team.created_by !== userId) {
    throw new StudentTeamError(403, "เฉพาะเจ้าของทีมเท่านั้นที่จัดการได้");
  }
  if (!team.recruitment_open) {
    throw new StudentTeamError(409, "ทีมนี้ปิดรับสมาชิกแล้วหรืออาจารย์ล็อกทีมไว้");
  }
  return team;
}

async function memberCount(
  client: PoolClient,
  teamId: string,
  userId?: string,
): Promise<number> {
  const res = await client.query<{ count: number }>(
    "SELECT public.student_team_member_count($1, $2) AS count",
    [teamId, userId ?? null],
  );
  return res.rows[0]?.count ?? 0;
}

function noteOrNull(note: string | null | undefined): string | null {
  const trimmed = note?.trim();
  return trimmed ? trimmed : null;
}

export async function loadStudentTeamsData(
  client: PoolClient,
  competitionId: string,
  viewerId: string,
  viewerRole: "student" | "teacher",
): Promise<StudentTeamsPayload | null> {
  const compRes = await client.query<CompetitionRow>(
    `SELECT id, title, deadline::text, min_size, max_size, status,
            team_formation_mode, recommended_roles, tech_stack_hints
     FROM public.competitions
     WHERE id = $1
     LIMIT 1`,
    [competitionId],
  );
  const competition = compRes.rows[0];
  if (!competition) return null;

  const teamRes = await client.query<TeamRow>(
    `SELECT id, competition_id, name, status, created_by,
            teacher_approved, recruitment_locked, created_at::text
     FROM public.teams
     WHERE competition_id = $1
       AND formation_source = 'student'
     ORDER BY created_at DESC, name ASC`,
    [competitionId],
  );
  const teams = await loadTeamSummaries(
    client,
    teamRes.rows.map((team) => team.id),
  );

  const [candidateRes, listingRes, interestRes] = await Promise.all([
    client.query<CandidateRow>(
      `SELECT id, full_name, nickname, grade, skills, preferred_role
       FROM public.query_student_team_candidates($1, $2::uuid)`,
      [competitionId, viewerId],
    ),
    client.query<OpenRoleListingRow>(
      `SELECT r.id, r.team_id, r.role, r.slots, r.status, r.note,
              public.student_team_open_role_taken(r.id) AS taken,
              t.name AS team_name
       FROM public.team_open_roles r
       JOIN public.teams t ON t.id = r.team_id
       WHERE t.competition_id = $1
         AND t.formation_source = 'student'
         AND t.status = 'draft'
         AND NOT t.recruitment_locked
         AND r.status = 'open'
       ORDER BY r.created_at DESC`,
      [competitionId],
    ),
    client.query<{ preferred_role: string }>(
      `SELECT preferred_role
       FROM public.interests
       WHERE user_id = $1 AND competition_id = $2
       LIMIT 1`,
      [viewerId, competitionId],
    ),
  ]);

  const candidates = candidateRes.rows.map(mapCandidate);
  const viewerTeams = teams.filter((team) =>
    team.members.some((member) => member.user_id === viewerId),
  );
  const viewerMemberIds = new Set(
    viewerTeams.flatMap((team) => team.members.map((member) => member.user_id)),
  );
  const viewerMembers = viewerTeams
    .flatMap((team) => team.members)
    .filter(
      (member, index, all) =>
        all.findIndex((candidate) => candidate.user_id === member.user_id) ===
        index,
    )
    .map((member) => ({
      user_id: member.user_id,
      assigned_role: member.assigned_role,
      skills: member.skills,
    }));
  const viewerOpenRoles = viewerTeams
    .flatMap((team) => team.open_roles)
    .filter((role) => role.status === "open" && role.slots > role.taken)
    .map((role) => ({ role: role.role, remaining: role.slots - role.taken }));

  const ranking = rankTeammates({
    competition: {
      recommended_roles: competition.recommended_roles,
      tech_stack_hints: competition.tech_stack_hints,
    },
    members: viewerMembers,
    candidates,
    open_roles: viewerOpenRoles,
    exclude_user_ids: [...viewerMemberIds, viewerId],
    limit: 8,
  });

  const todayIso = getTodayIsoBangkok();
  const hasConfirmedTeam = viewerTeams.some(
    (team) => team.status === "confirmed",
  );
  const eligible =
    viewerRole === "student" &&
    isStudentMode(competition.team_formation_mode) &&
    competition.status === "open" &&
    (competition.deadline === null || competition.deadline >= todayIso) &&
    interestRes.rows.length > 0 &&
    !hasConfirmedTeam;

  return {
    competition: {
      id: competition.id,
      title: competition.title,
      deadline: competition.deadline,
      min_size: competition.min_size,
      max_size: competition.max_size,
      status: competition.status,
      team_formation_mode: competition.team_formation_mode,
      recommended_roles: competition.recommended_roles,
      tech_stack_hints: competition.tech_stack_hints,
    },
    viewer: {
      id: viewerId,
      role: viewerRole,
      is_teacher: viewerRole === "teacher",
    },
    eligible,
    teams,
    open_roles: listingRes.rows.map((row) => ({
      ...mapOpenRole(row),
      team_name: row.team_name,
    })),
    suggestions: Array.from(ranking.ranked),
    ranking: ranking.explanation,
    directory_candidates: candidates,
  };
}

export async function createStudentDraftTeam(
  client: PoolClient,
  input: {
    competitionId: string;
    userId: string;
    name: string;
    role: string;
  },
): Promise<StudentTeamSummary> {
  const compRes = await client.query<CompetitionRow>(
    `SELECT id, title, deadline::text, min_size, max_size, status,
            team_formation_mode, recommended_roles, tech_stack_hints
     FROM public.competitions
     WHERE id = $1
     LIMIT 1`,
    [input.competitionId],
  );
  const competition = compRes.rows[0];
  if (!competition) {
    throw new StudentTeamError(404, "ไม่พบรายการแข่งขันนี้");
  }
  assertEligibleCompetition(competition, getTodayIsoBangkok());

  const interestRes = await client.query(
    `SELECT 1 FROM public.interests
     WHERE user_id = $1 AND competition_id = $2
     LIMIT 1`,
    [input.userId, input.competitionId],
  );
  if (interestRes.rowCount === 0) {
    throw new StudentTeamError(
      403,
      "กรุณาลงชื่อสนใจรายการแข่งขันนี้ก่อนจัดตั้งทีม",
    );
  }

  // Serialize draft creation per competition so two concurrent requests from
  // the same student cannot both pass the duplicate-membership check.
  await client.query(
    "SELECT id FROM public.competitions WHERE id = $1 FOR UPDATE",
    [input.competitionId],
  );

  const existingRes = await client.query(
    `SELECT 1
     FROM public.teams t
     JOIN public.team_members tm ON tm.team_id = t.id
     WHERE t.competition_id = $1
       AND tm.user_id = $2
     LIMIT 1`,
    [input.competitionId, input.userId],
  );
  if (existingRes.rowCount !== 0) {
    throw new StudentTeamError(409, "คุณอยู่ในทีมของรายการนี้แล้ว");
  }

  const teamRes = await client.query<{ id: string }>(
    `INSERT INTO public.teams
       (competition_id, name, created_by, formation_source, status,
        teacher_approved, recruitment_locked)
     VALUES ($1, $2, $3, 'student', 'draft', false, false)
     RETURNING id`,
    [input.competitionId, input.name.trim(), input.userId],
  );
  const teamId = teamRes.rows[0]?.id;
  if (!teamId) {
    throw new StudentTeamError(500, "ไม่สามารถสร้างทีมได้");
  }

  await client.query(
    `INSERT INTO public.team_members (team_id, user_id, assigned_role)
     VALUES ($1, $2, $3)`,
    [teamId, input.userId, input.role],
  );

  const teams = await loadTeamSummaries(client, [teamId]);
  const team = teams[0];
  if (!team) {
    throw new StudentTeamError(500, "ไม่สามารถโหลดทีมที่สร้างได้");
  }
  return team;
}

export async function createTeamInvitation(
  client: PoolClient,
  input: {
    teamId: string;
    senderId: string;
    targetUserId: string;
    role: string;
    openRoleId: string | null;
    note: string | null;
  },
): Promise<{ invitation: StudentTeamInvitation; notice: RecruitmentNoticeInput }> {
  await assertTeamOwner(client, input.teamId, input.senderId);
  const competition = await assertTeamRecruitable(client, input.teamId);

  const visibleRes = await client.query(
    "SELECT public.is_directory_visible_student($1) AS visible",
    [input.targetUserId],
  );
  if (visibleRes.rows[0]?.visible !== true) {
    throw new StudentTeamError(
      403,
      "เฉพาะนักเรียนที่เปิดโปรไฟล์ให้ค้นหาได้เท่านั้นที่เชิญเข้าทีมได้",
    );
  }

  if ((await memberCount(client, input.teamId, input.targetUserId)) > 0) {
    throw new StudentTeamError(409, "นักเรียนรายนี้อยู่ในทีมแล้ว");
  }

  if (input.openRoleId) {
    const roleRes = await client.query<{
      role: string;
      status: OpenRoleStatus;
      slots: number;
      taken: number;
    }>(
      `SELECT role, status, slots,
              public.student_team_open_role_taken(id) AS taken
       FROM public.team_open_roles
       WHERE id = $1 AND team_id = $2
       LIMIT 1
       FOR UPDATE`,
      [input.openRoleId, input.teamId],
    );
    const openRole = roleRes.rows[0];
    if (!openRole || openRole.status !== "open") {
      throw new StudentTeamError(409, "ไม่พบตำแหน่งที่เปิดรับนี้");
    }
    if (openRole.taken >= openRole.slots) {
      throw new StudentTeamError(409, "ตำแหน่งนี้รับสมาชิกครบแล้ว");
    }
    if (openRole.role !== input.role) {
      throw new StudentTeamError(400, "บทบาทไม่ตรงกับตำแหน่งที่เปิดรับ");
    }
  }

  const duplicateRes = await client.query(
    `SELECT 1 FROM public.team_invitations
     WHERE team_id = $1
       AND direction = 'team_invite'
       AND sender_id = $2
       AND recipient_id = $3
       AND role = $4
       AND status = 'pending'
     LIMIT 1`,
    [input.teamId, input.senderId, input.targetUserId, input.role],
  );
  if (duplicateRes.rowCount !== 0) {
    throw new StudentTeamError(409, "คุณส่งคำเชิญให้เพื่อนรายนี้แล้ว");
  }

  const insertRes = await client.query<InvitationRow>(
    `INSERT INTO public.team_invitations
       (team_id, direction, sender_id, recipient_id, open_role_id, role, note)
     VALUES ($1, 'team_invite', $2, $3, $4, $5, $6)
     RETURNING id, team_id, direction, sender_id, recipient_id, open_role_id,
               role, note, status, created_at::text, responded_at::text`,
    [
      input.teamId,
      input.senderId,
      input.targetUserId,
      input.openRoleId,
      input.role,
      input.note,
    ],
  );
  const invitation = insertRes.rows[0];
  if (!invitation) {
    throw new StudentTeamError(500, "ไม่สามารถส่งคำเชิญได้");
  }

  return {
    invitation: mapInvitation(invitation),
    notice: {
      event: "invite",
      invitation_id: invitation.id,
      team_id: input.teamId,
      competition_id: competition.id,
      competition_title: competition.title,
      team_name: await teamName(client, input.teamId),
      role: input.role,
      sender_id: input.senderId,
      recipient_id: input.targetUserId,
    },
  };
}

export async function createJoinRequest(
  client: PoolClient,
  input: {
    teamId: string;
    openRoleId: string;
    senderId: string;
    note: string | null;
  },
): Promise<{ invitation: StudentTeamInvitation; notice: RecruitmentNoticeInput }> {
  const visibleRes = await client.query<{ visible: boolean }>(
    `SELECT p.directory_visible AS visible
     FROM public.profiles p
     WHERE p.id = $1 AND p.role = 'student'
     LIMIT 1`,
    [input.senderId],
  );
  if (visibleRes.rows[0]?.visible !== true) {
    throw new StudentTeamError(
      403,
      "กรุณาเปิดโปรไฟล์ให้ค้นหาได้ก่อนขอเข้าร่วมทีม",
    );
  }

  const roleRes = await client.query<{
    role: string;
    status: OpenRoleStatus;
    slots: number;
    taken: number;
  }>(
    `SELECT role, status, slots, public.student_team_open_role_taken(id) AS taken
     FROM public.team_open_roles
     WHERE id = $1 AND team_id = $2
     LIMIT 1
     FOR UPDATE`,
    [input.openRoleId, input.teamId],
  );
  const openRole = roleRes.rows[0];
  if (!openRole || openRole.status !== "open") {
    throw new StudentTeamError(409, "ไม่พบตำแหน่งที่เปิดรับนี้");
  }
  if (openRole.taken >= openRole.slots) {
    throw new StudentTeamError(409, "ตำแหน่งนี้รับสมาชิกครบแล้ว");
  }

  const teamRes = await client.query<{
    created_by: string | null;
    name: string;
  }>(
    `SELECT t.created_by, t.name
     FROM public.teams t
     WHERE t.id = $1
     LIMIT 1`,
    [input.teamId],
  );
  const team = teamRes.rows[0];
  if (!team?.created_by || team.created_by === input.senderId) {
    throw new StudentTeamError(409, "ไม่สามารถขอเข้าทีมของตนเองได้");
  }

  const competition = await assertTeamRecruitable(client, input.teamId);
  if ((await memberCount(client, input.teamId, input.senderId)) > 0) {
    throw new StudentTeamError(409, "คุณอยู่ในทีมนี้แล้ว");
  }

  const duplicateRes = await client.query(
    `SELECT 1 FROM public.team_invitations
     WHERE team_id = $1
       AND direction = 'join_request'
       AND sender_id = $2
       AND status = 'pending'
     LIMIT 1`,
    [input.teamId, input.senderId],
  );
  if (duplicateRes.rowCount !== 0) {
    throw new StudentTeamError(409, "คุณส่งคำขอเข้าทีมนี้แล้ว");
  }

  const insertRes = await client.query<InvitationRow>(
    `INSERT INTO public.team_invitations
       (team_id, direction, sender_id, recipient_id, open_role_id, role, note)
     VALUES ($1, 'join_request', $2, $3, $4, $5, $6)
     RETURNING id, team_id, direction, sender_id, recipient_id, open_role_id,
               role, note, status, created_at::text, responded_at::text`,
    [
      input.teamId,
      input.senderId,
      team.created_by,
      input.openRoleId,
      openRole.role,
      input.note,
    ],
  );
  const invitation = insertRes.rows[0];
  if (!invitation) {
    throw new StudentTeamError(500, "ไม่สามารถส่งคำขอเข้าทีมได้");
  }

  return {
    invitation: mapInvitation(invitation),
    notice: {
      event: "request",
      invitation_id: invitation.id,
      team_id: input.teamId,
      competition_id: competition.id,
      competition_title: competition.title,
      team_name: team.name,
      role: openRole.role,
      sender_id: input.senderId,
      recipient_id: team.created_by,
    },
  };
}

async function teamName(client: PoolClient, teamId: string): Promise<string> {
  const res = await client.query<{ name: string }>(
    "SELECT name FROM public.teams WHERE id = $1 LIMIT 1",
    [teamId],
  );
  return res.rows[0]?.name ?? "ทีมของฉัน";
}

export async function respondToInvitation(
  client: PoolClient,
  input: {
    invitationId: string;
    userId: string;
    action: InvitationAction;
  },
): Promise<InvitationResolution> {
  const res = await client.query<AcceptRow>(
    `SELECT i.id, i.team_id, i.direction, i.sender_id, i.recipient_id,
            i.open_role_id, i.role, i.note, i.status,
            i.created_at::text, i.responded_at::text,
            t.name AS team_name, t.competition_id,
            t.status AS team_status, t.recruitment_locked,
            t.formation_source,
            c.title AS competition_title, c.status AS competition_status,
            c.max_size, c.deadline::text, c.team_formation_mode,
            r.status AS open_role_status, r.slots AS open_role_slots,
            r.role AS open_role_role,
            public.student_team_open_role_taken(i.open_role_id) AS open_role_taken
     FROM public.team_invitations i
     JOIN public.teams t ON t.id = i.team_id
     JOIN public.competitions c ON c.id = t.competition_id
     LEFT JOIN public.team_open_roles r ON r.id = i.open_role_id
     WHERE i.id = $1
     FOR UPDATE OF i, t`,
    [input.invitationId],
  );
  const invitation = res.rows[0];
  if (!invitation) {
    throw new StudentTeamError(404, "ไม่พบคำเชิญหรือคำขอนี้");
  }
  if (invitation.status !== "pending") {
    throw new StudentTeamError(409, "รายการนี้ตอบรับไปแล้ว");
  }

  const isSender = invitation.sender_id === input.userId;
  const isRecipient = invitation.recipient_id === input.userId;
  if (!isSender && !isRecipient) {
    throw new StudentTeamError(403, "คุณไม่มีสิทธิ์จัดการรายการนี้");
  }

  let joiningUserId: string | null = null;
  if (input.action === "accept") {
    if (!isRecipient) {
      throw new StudentTeamError(403, "เฉพาะผู้รับคำเชิญหรือเจ้าของทีมเท่านั้นที่ยืนยันได้");
    }
    joiningUserId =
      invitation.direction === "team_invite"
        ? invitation.recipient_id
        : invitation.sender_id;

    assertEligibleCompetition(
      {
        status: invitation.competition_status,
        deadline: invitation.deadline,
        team_formation_mode: invitation.team_formation_mode,
      },
      getTodayIsoBangkok(),
    );
    if (
      invitation.formation_source !== "student" ||
      invitation.team_status !== "draft" ||
      invitation.recruitment_locked
    ) {
      throw new StudentTeamError(409, "ทีมนี้ไม่เปิดรับสมาชิกเพิ่มแล้ว");
    }
    if (
      invitation.open_role_id !== null &&
      (invitation.open_role_status !== "open" ||
        invitation.open_role_slots === null ||
        invitation.open_role_taken >= invitation.open_role_slots)
    ) {
      throw new StudentTeamError(409, "ตำแหน่งนี้รับสมาชิกครบแล้ว");
    }
    if ((await memberCount(client, invitation.team_id)) >= invitation.max_size) {
      throw new StudentTeamError(409, "ทีมนี้มีสมาชิกครบตามจำนวนที่กำหนดแล้ว");
    }
    if ((await memberCount(client, invitation.team_id, joiningUserId)) > 0) {
      throw new StudentTeamError(409, "ผู้รายนี้อยู่ในทีมแล้ว");
    }

    await client.query(
      `INSERT INTO public.team_members (team_id, user_id, assigned_role)
       VALUES ($1, $2, $3)`,
      [invitation.team_id, joiningUserId, invitation.role],
    );
  } else if (input.action === "revoke" && !isSender) {
    throw new StudentTeamError(403, "เฉพาะผู้ส่งรายการนี้เท่านั้นที่ยกเลิกได้");
  }

  const nextStatus =
    input.action === "accept"
      ? "accepted"
      : input.action === "decline"
        ? "declined"
        : "revoked";
  const updateRes = await client.query<InvitationRow>(
    `UPDATE public.team_invitations
     SET status = $1, responded_at = now()
     WHERE id = $2
     RETURNING id, team_id, direction, sender_id, recipient_id, open_role_id,
               role, note, status, created_at::text, responded_at::text`,
    [nextStatus, input.invitationId],
  );
  const updated = updateRes.rows[0];
  if (!updated) {
    throw new StudentTeamError(500, "ไม่สามารถอัปเดตสถานะได้");
  }

  return {
    invitation: mapInvitation(updated),
    notice:
      input.action === "accept"
        ? {
            event: "accepted",
            invitation_id: invitation.id,
            team_id: invitation.team_id,
            competition_id: invitation.competition_id,
            competition_title: invitation.competition_title,
            team_name: invitation.team_name,
            role: invitation.role,
            sender_id: invitation.sender_id,
            recipient_id: invitation.recipient_id,
          }
        : null,
  };
}

export async function listTeamInvitations(
  client: PoolClient,
  teamId: string,
): Promise<StudentTeamInvitation[]> {
  const res = await client.query<InvitationRow>(
    `SELECT id, team_id, direction, sender_id, recipient_id, open_role_id,
            role, note, status, created_at::text, responded_at::text
     FROM public.team_invitations
     WHERE team_id = $1
     ORDER BY created_at DESC`,
    [teamId],
  );
  return res.rows.map(mapInvitation);
}

export async function listTeamOpenRoles(
  client: PoolClient,
  teamId: string,
): Promise<StudentTeamOpenRole[]> {
  const res = await client.query<OpenRoleRow>(
    `SELECT id, team_id, role, slots, status, note,
            public.student_team_open_role_taken(id) AS taken
     FROM public.team_open_roles
     WHERE team_id = $1
     ORDER BY created_at ASC, role ASC`,
    [teamId],
  );
  return res.rows.map(mapOpenRole);
}

export async function createTeamOpenRole(
  client: PoolClient,
  input: {
    teamId: string;
    userId: string;
    role: string;
    slots: number;
    note: string | null;
  },
): Promise<StudentTeamOpenRole> {
  await assertTeamOwner(client, input.teamId, input.userId);
  const res = await client.query<OpenRoleRow>(
    `INSERT INTO public.team_open_roles (team_id, role, slots, note, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, team_id, role, slots, status, note,
               public.student_team_open_role_taken(id) AS taken`,
    [
      input.teamId,
      input.role,
      input.slots,
      input.note,
      input.userId,
    ],
  );
  const openRole = res.rows[0];
  if (!openRole) {
    throw new StudentTeamError(500, "ไม่สามารถเพิ่มตำแหน่งที่เปิดรับได้");
  }
  return mapOpenRole(openRole);
}

export async function updateTeamOpenRole(
  client: PoolClient,
  input: {
    teamId: string;
    userId: string;
    roleId: string;
    role?: string;
    slots?: number;
    status?: OpenRoleStatus;
    note?: string | null;
  },
): Promise<StudentTeamOpenRole> {
  await assertTeamOwner(client, input.teamId, input.userId);
  const res = await client.query<OpenRoleRow>(
    `UPDATE public.team_open_roles
     SET role = COALESCE($3, role),
         slots = COALESCE($4, slots),
         status = COALESCE($5, status),
         note = CASE WHEN $6::boolean THEN $7::text ELSE note END
     WHERE id = $1 AND team_id = $2
     RETURNING id, team_id, role, slots, status, note,
               public.student_team_open_role_taken(id) AS taken`,
    [
      input.roleId,
      input.teamId,
      input.role ?? null,
      input.slots ?? null,
      input.status ?? null,
      input.note !== undefined,
      noteOrNull(input.note),
    ],
  );
  const openRole = res.rows[0];
  if (!openRole) {
    throw new StudentTeamError(404, "ไม่พบตำแหน่งที่เปิดรับนี้");
  }
  return mapOpenRole(openRole);
}

export async function deleteTeamOpenRole(
  client: PoolClient,
  input: { teamId: string; userId: string; roleId: string },
): Promise<void> {
  await assertTeamOwner(client, input.teamId, input.userId);
  const res = await client.query(
    "DELETE FROM public.team_open_roles WHERE id = $1 AND team_id = $2",
    [input.roleId, input.teamId],
  );
  if ((res.rowCount ?? 0) === 0) {
    throw new StudentTeamError(404, "ไม่พบตำแหน่งที่เปิดรับนี้");
  }
}

export async function applyTeacherControl(
  client: PoolClient,
  competitionId: string,
  input: TeacherControlInput,
): Promise<{ ok: true; team_id?: string; team_formation_mode?: string }> {
  if (input.action === "set_mode") {
    const res = await client.query(
      `UPDATE public.competitions
       SET team_formation_mode = $2
       WHERE id = $1
       RETURNING id`,
      [competitionId, input.team_formation_mode],
    );
    if ((res.rowCount ?? 0) === 0) {
      throw new StudentTeamError(404, "ไม่พบรายการแข่งขันนี้");
    }
    return { ok: true, team_formation_mode: input.team_formation_mode };
  }

  if (input.action === "approve") {
    const res = await client.query<{
      name: string;
      min_size: number;
      max_size: number;
    }>(
      `SELECT t.name, c.min_size, c.max_size
       FROM public.teams t
       JOIN public.competitions c ON c.id = t.competition_id
       WHERE t.id = $1
         AND t.competition_id = $2
         AND t.formation_source = 'student'
         AND t.status = 'draft'
       LIMIT 1
       FOR UPDATE OF t`,
      [input.team_id, competitionId],
    );
    const team = res.rows[0];
    if (!team) {
      throw new StudentTeamError(404, "ไม่พบทีมนักเรียนที่รออนุมัติ");
    }
    const count = await memberCount(client, input.team_id);
    if (count < team.min_size || count > team.max_size) {
      throw new StudentTeamError(
        400,
        `ทีม “${team.name}” ต้องมีสมาชิก ${team.min_size}–${team.max_size} คนก่อนอนุมัติ`,
      );
    }
    await client.query(
      `UPDATE public.teams
       SET status = 'confirmed', teacher_approved = true, recruitment_locked = true
       WHERE id = $1 AND competition_id = $2`,
      [input.team_id, competitionId],
    );
    return { ok: true, team_id: input.team_id };
  }

  const res = await client.query(
    `UPDATE public.teams
     SET recruitment_locked = $3
     WHERE id = $1
       AND competition_id = $2
       AND formation_source = 'student'
       AND status = 'draft'`,
    [input.team_id, competitionId, input.locked],
  );
  if ((res.rowCount ?? 0) === 0) {
    throw new StudentTeamError(404, "ไม่พบทีมนักเรียนที่เปิดรับอยู่");
  }
  return { ok: true, team_id: input.team_id };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function noticeContent(
  input: RecruitmentNoticeInput,
  senderName: string,
  targetName: string,
): { kind: string; title: string; body: string; subject: string } {
  if (input.event === "invite") {
    return {
      kind: "student_team_invite",
      title: `คุณถูกเชิญเข้าทีม ${input.team_name}`,
      body: `${input.competition_title} · ตำแหน่ง ${input.role} · เชิญโดย ${senderName}`,
      subject: `คำเชิญเข้าทีม ${input.team_name}`,
    };
  }
  if (input.event === "request") {
    return {
      kind: "student_team_request",
      title: `มีคำขอเข้าร่วมทีม ${input.team_name}`,
      body: `${senderName} ต้องการเข้าร่วมตำแหน่ง ${input.role} ใน ${input.competition_title}`,
      subject: `คำขอเข้าร่วมทีม ${input.team_name}`,
    };
  }
  return {
    kind: "student_team_accepted",
    title: `ยืนยันการเข้าร่วมทีม ${input.team_name}`,
    body: `${targetName} เข้าร่วมตำแหน่ง ${input.role} ใน ${input.competition_title} แล้ว`,
    subject: `ยืนยันสมาชิกทีม ${input.team_name}`,
  };
}

/**
 * Writes notification and outbox rows after the caller has completed an
 * authorized, transactional recruitment action. System scope is required
 * because those two tables are system-only under FORCE RLS.
 */
export async function writeRecruitmentNotice(
  input: RecruitmentNoticeInput,
): Promise<void> {
  await withSystemDb(async (client) => {
    const accountRes = await client.query<{
      id: string;
      full_name: string;
      email: string;
    }>(
      `SELECT p.id, p.full_name, a.email
       FROM public.profiles p
       JOIN public.auth_accounts a ON a.id = p.id
       WHERE p.id = ANY($1::uuid[])`,
      [[input.sender_id, input.recipient_id]],
    );
    const accounts = new Map(accountRes.rows.map((row) => [row.id, row]));
    const senderName = accounts.get(input.sender_id)?.full_name || "เพื่อนร่วมทีม";
    const targetName =
      accounts.get(input.recipient_id)?.full_name || "สมาชิกใหม่";
    const targets =
      input.event === "accepted"
        ? [...new Set([input.sender_id, input.recipient_id])]
        : [input.recipient_id];

    for (const targetId of targets) {
      const account = accounts.get(targetId);
      if (!account) continue;
      const content = noticeContent(input, senderName, targetName);
      const dedupeKey = `student-team:${input.event}:${input.invitation_id}:${targetId}`.slice(
        0,
        200,
      );

      await client.query(
        `INSERT INTO public.notifications
           (user_id, kind, title, body, href, competition_id, team_id, dedupe_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
        [
          targetId,
          content.kind,
          content.title,
          content.body,
          `/my-teams/${input.team_id}`,
          input.competition_id,
          input.team_id,
          dedupeKey,
        ],
      );

      const text = `${content.title}\n${content.body}\nดูรายละเอียดใน TechComp Hub`;
      const html = `<div style="font-family:system-ui,sans-serif;line-height:1.6"><h2>${escapeHtml(content.title)}</h2><p>${escapeHtml(content.body)}</p></div>`;
      await client.query(
        `INSERT INTO public.email_outbox (to_email, template, payload, scheduled_at)
         VALUES ($1, 'student_team_recruitment', $2::jsonb, now())`,
        [
          account.email,
          JSON.stringify({
            subject: content.subject,
            text,
            html,
          }),
        ],
      );
    }
  });
}
