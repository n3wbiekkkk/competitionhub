import type {
  CompetitionSourceType,
  CompetitionStatus,
  TeamStatus,
  TechCategory,
  UserRole,
} from "@/lib/constants/tech-taxonomy";

export interface Profile {
  id: string;
  full_name: string;
  nickname: string | null;
  email: string;
  role: UserRole;
  grade: string | null;
  skills: string[];
  contact: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  bio: string | null;
  avatar_url: string | null;
  discord_url: string | null;
  line_url: string | null;
  directory_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfileUpdate {
  full_name?: string;
  nickname?: string | null;
  grade?: string | null;
  skills?: string[];
  contact?: string | null;
  github_url?: string | null;
  portfolio_url?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  discord_url?: string | null;
  line_url?: string | null;
  directory_visible?: boolean;
}

export interface DirectoryProfile {
  id: string;
  full_name: string;
  nickname: string | null;
  grade: string | null;
  skills: string[];
  role: UserRole;
  avatar_url: string | null;
}

export interface DirectoryPersonProfile extends DirectoryProfile {
  bio: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  discord_url: string | null;
  line_url: string | null;
  contact: string | null;
}

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

export interface CompetitionComment {
  id: string;
  competition_id: string;
  author_id: string | null;
  body: string;
  is_pinned: boolean;
  is_official: boolean;
  created_at: string;
}

export interface CompetitionResult {
  id: string;
  competition_id: string;
  team_id: string | null;
  award_title: string;
  rank_tier: string | null;
  certificate_url: string | null;
  reflection: string | null;
  created_at: string;
}

export interface OutboxItem {
  id: string;
  to_email: string;
  template: string;
  status: "pending" | "sent" | "failed";
  attempts: number;
  last_error: string | null;
  created_at: string;
}

export interface AuditLogItem {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  created_at: string;
}

export interface UserSessionItem {
  jti: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  last_active_at: string;
  is_current: boolean;
}

export interface PasswordResetRequest {
  id: string;
  user_id: string;
  status: "pending" | "resolved" | "rejected" | "expired";
  requested_at: string;
  expires_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  email?: string | null;
  full_name?: string | null;
}

export interface Competition {
  id: string;
  title: string;
  category: TechCategory;
  deadline: string | null;
  min_size: number;
  max_size: number;
  recommended_roles: string[];
  tech_stack_hints: string[];
  eligibility: string | null;
  summary: string | null;
  source_url: string | null;
  source_type: CompetitionSourceType;
  status: CompetitionStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompetitionInsert {
  title: string;
  category: TechCategory;
  deadline?: string | null;
  min_size?: number;
  max_size?: number;
  recommended_roles?: string[];
  tech_stack_hints?: string[];
  eligibility?: string | null;
  summary?: string | null;
  source_url?: string | null;
  source_type?: CompetitionSourceType;
  status?: CompetitionStatus;
  created_by?: string | null;
}

export type CompetitionUpdate = Partial<CompetitionInsert>;

export interface Interest {
  id: string;
  user_id: string;
  competition_id: string;
  preferred_role: string;
  note: string | null;
  created_at: string;
}

export interface InterestInsert {
  user_id: string;
  competition_id: string;
  preferred_role: string;
  note?: string | null;
}

export interface Team {
  id: string;
  competition_id: string;
  name: string;
  advisor_id: string | null;
  status: TeamStatus;
  created_at: string;
  updated_at: string;
}

export interface TeamInsert {
  competition_id: string;
  name: string;
  advisor_id?: string | null;
  status?: TeamStatus;
}

export interface TeamMember {
  team_id: string;
  user_id: string;
  assigned_role: string;
}

export type TeamMemberInsert = TeamMember;

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  fullName: string;
}

export interface AdminUserItem extends Profile {
  interest_count: number;
  confirmed_team_count: number;
}

export interface AdminCompetitionItem extends Competition {
  interest_count: number;
  team_count: number;
  confirmed_team_count: number;
}

export interface AdminTeamMemberSummary {
  user_id: string;
  full_name: string;
  nickname: string | null;
  grade: string | null;
  assigned_role: string;
}

export interface AdminTeamItem {
  id: string;
  competition_id: string;
  competition_title: string;
  name: string;
  status: TeamStatus;
  advisor_name: string | null;
  created_at: string;
  members: AdminTeamMemberSummary[];
}
