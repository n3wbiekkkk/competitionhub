export const EXPECTED_MIGRATION = "0014_badges_reports";

export const REQUIRED_TABLES = [
  "audit_logs",
  "auth_security",
  "badge_definitions",
  "calendar_feed_tokens",
  "competition_bookmarks",
  "competition_comments",
  "email_outbox",
  "notifications",
  "profile_avatars",
  "team_ai_plans",
  "team_checkins",
  "team_deliverables",
  "team_invitations",
  "team_messages",
  "team_open_roles",
  "rate_limit_buckets",
  "schema_migrations",
  "team_tasks",
  "user_badges",
  "user_sessions",
  "webhook_routes",
] as const;

export const REQUIRED_FUNCTIONS = [
  "app_session_version",
  "app_uid",
  "query_profile_directory",
  "query_student_team_candidates",
  "get_public_showcase_results",
  "refresh_user_badges",
] as const;

export const REQUIRED_TRIGGERS = [
  "assert_confirmed_team_size_trigger",
  "ensure_notification_preferences_trigger",
  "refresh_badges_after_interest_trigger",
  "set_team_checkins_updated_at",
] as const;

export interface SchemaProbe {
  version: string | null;
  tables: number;
  functions: number;
  triggers: number;
}

export function isSchemaCurrent(probe: SchemaProbe | null): boolean {
  return (
    probe !== null &&
    probe.version === EXPECTED_MIGRATION &&
    Number(probe.tables) === REQUIRED_TABLES.length &&
    Number(probe.functions) === REQUIRED_FUNCTIONS.length &&
    Number(probe.triggers) === REQUIRED_TRIGGERS.length
  );
}
