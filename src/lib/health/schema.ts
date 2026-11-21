export const EXPECTED_MIGRATION = "0009_team_task_rls";

export const REQUIRED_TABLES = [
  "audit_logs",
  "auth_security",
  "competition_bookmarks",
  "competition_comments",
  "email_outbox",
  "notifications",
  "profile_avatars",
  "rate_limit_buckets",
  "schema_migrations",
  "team_tasks",
  "user_sessions",
] as const;

export const REQUIRED_FUNCTIONS = [
  "app_session_version",
  "app_uid",
  "query_profile_directory",
] as const;

export const REQUIRED_TRIGGERS = [
  "assert_confirmed_team_size_trigger",
  "ensure_notification_preferences_trigger",
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
