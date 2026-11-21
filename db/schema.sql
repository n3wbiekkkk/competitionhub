-- ============================================================================
-- TechComp Hub — PostgreSQL 16 Schema & Strict Row Level Security (RLS)
-- Self-hosted edition (Local Auth + PostgreSQL RLS via app.current_user_id)
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------

create table if not exists public.auth_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists auth_accounts_email_lower_idx
  on public.auth_accounts (lower(email));

create table if not exists public.auth_security (
  user_id uuid primary key references public.auth_accounts(id) on delete cascade,
  session_version integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references public.auth_accounts(id) on delete cascade,
  full_name text not null default '',
  nickname text,
  email text not null default '',
  role text not null default 'student'
    check (role in ('student', 'teacher')),
  grade text,
  skills text[] not null default '{}',
  contact text,
  github_url text,
  portfolio_url text,
  bio text,
  avatar_url text,
  discord_url text,
  line_url text,
  directory_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists nickname text;
alter table public.profiles add column if not exists directory_visible boolean not null default false;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists discord_url text;
alter table public.profiles add column if not exists line_url text;

create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (btrim(title) <> ''),
  category text not null check (
    category in (
      'Programming / Competitive',
      'AI & Data Science',
      'Web & Mobile Dev',
      'Cybersecurity / CTF',
      'Robotics & IoT',
      'Game Dev',
      'Tech Hackathon & Innovation',
      'UI/UX & Digital Design'
    )
  ),
  deadline date,
  min_size integer not null default 1 check (min_size >= 1),
  max_size integer not null default 4 check (max_size >= min_size),
  recommended_roles text[] not null default '{}',
  tech_stack_hints text[] not null default '{}',
  eligibility text,
  summary text,
  source_url text,
  source_type text not null default 'manual'
    check (source_type in ('ai_auto', 'ai_link', 'ai_poster', 'manual')),
  status text not null default 'pending_review'
    check (status in ('pending_review', 'open', 'closed', 'rejected')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  preferred_role text not null check (btrim(preferred_role) <> ''),
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, competition_id)
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  advisor_id uuid references public.profiles(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'confirmed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_role text not null check (btrim(assigned_role) <> ''),
  primary key (team_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 2. Indexes
-- ----------------------------------------------------------------------------

create unique index if not exists competitions_source_url_unique_idx
  on public.competitions (source_url)
  where source_url is not null and btrim(source_url) <> '';

create index if not exists competitions_status_deadline_idx
  on public.competitions (status, deadline);

create index if not exists competitions_category_idx
  on public.competitions (category);

create index if not exists competitions_created_by_idx
  on public.competitions (created_by);

create index if not exists interests_competition_id_idx
  on public.interests (competition_id);

create index if not exists teams_competition_status_idx
  on public.teams (competition_id, status);

create index if not exists team_members_user_id_idx
  on public.team_members (user_id);

create index if not exists profiles_skills_gin_idx
  on public.profiles using gin (skills);

drop index if exists public.interests_user_id_idx;

create index if not exists competitions_title_trgm_idx
  on public.competitions using gin (title gin_trgm_ops);

create index if not exists competitions_summary_trgm_idx
  on public.competitions using gin ((coalesce(summary, '')) gin_trgm_ops);

create index if not exists competitions_tech_stack_hints_gin_idx
  on public.competitions using gin (tech_stack_hints);

create index if not exists profiles_directory_visible_idx
  on public.profiles (directory_visible)
  where directory_visible;

create index if not exists competitions_source_url_lower_idx
  on public.competitions (lower(source_url))
  where source_url is not null;

-- ----------------------------------------------------------------------------
-- 3. Triggers (updated_at)
-- ----------------------------------------------------------------------------

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

drop trigger if exists set_competitions_updated_at on public.competitions;
create trigger set_competitions_updated_at
  before update on public.competitions
  for each row execute function public.handle_updated_at();

drop trigger if exists set_teams_updated_at on public.teams;
create trigger set_teams_updated_at
  before update on public.teams
  for each row execute function public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Session & RLS Helper Functions (SECURITY DEFINER, zero RLS recursion)
-- ----------------------------------------------------------------------------

create or replace function public.app_uid()
returns uuid
language plpgsql
stable
as $$
declare
  v_raw text;
begin
  v_raw := nullif(btrim(current_setting('app.current_user_id', true)), '');
  if v_raw is null then
    return null;
  end if;
  return v_raw::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function public.app_is_system()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('app.system_mode', true) = 'on', false);
$$;

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = public.app_uid()
      and p.role = 'teacher'
  );
$$;

create or replace function public.app_session_version()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.session_version from public.auth_security s where s.user_id = public.app_uid()),
    0
  );
$$;

create or replace function public.is_confirmed_team_member(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams t
    join public.team_members tm on tm.team_id = t.id
    where t.id = target_team_id
      and t.status = 'confirmed'
      and tm.user_id = public.app_uid()
  );
$$;

create or replace function public.can_view_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target_profile_id = public.app_uid()
    or public.is_teacher()
    or exists (
      select 1
      from public.teams t
      join public.team_members my_tm
        on my_tm.team_id = t.id
       and my_tm.user_id = public.app_uid()
      left join public.team_members peer_tm
        on peer_tm.team_id = t.id
       and peer_tm.user_id = target_profile_id
      where t.status = 'confirmed'
        and (
          peer_tm.user_id is not null
          or t.advisor_id = target_profile_id
        )
    );
$$;

create or replace function public.assert_confirmed_team_size()
returns trigger
language plpgsql
as $$
declare
  v_team_id uuid := new.id;
  v_status text;
  v_min integer;
  v_max integer;
  v_count integer;
begin
  select t.status, c.min_size, c.max_size
    into v_status, v_min, v_max
  from public.teams t
  join public.competitions c on c.id = t.competition_id
  where t.id = v_team_id;

  if not found or v_status <> 'confirmed' then
    return null;
  end if;

  select count(*)::int into v_count
  from public.team_members tm
  where tm.team_id = v_team_id;

  if v_count < v_min or v_count > v_max then
    raise exception 'TEAM_SIZE_INVALID:%:%', v_min, v_max
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

create or replace function public.assert_confirmed_team_member_count()
returns trigger
language plpgsql
as $$
declare
  v_team_id uuid;
  v_status text;
  v_min integer;
  v_max integer;
  v_count integer;
begin
  if tg_op = 'DELETE' then
    v_team_id := old.team_id;
  else
    v_team_id := new.team_id;
  end if;

  select t.status, c.min_size, c.max_size
    into v_status, v_min, v_max
  from public.teams t
  join public.competitions c on c.id = t.competition_id
  where t.id = v_team_id;

  if not found or v_status <> 'confirmed' then
    return null;
  end if;

  select count(*)::int into v_count
  from public.team_members tm
  where tm.team_id = v_team_id;

  if v_count < v_min or v_count > v_max then
    raise exception 'TEAM_SIZE_INVALID:%:%', v_min, v_max
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

drop trigger if exists assert_confirmed_team_size_trigger on public.teams;
create constraint trigger assert_confirmed_team_size_trigger
  after insert or update on public.teams
  deferrable initially deferred
  for each row execute function public.assert_confirmed_team_size();

drop trigger if exists assert_confirmed_team_member_count_trigger on public.team_members;
create constraint trigger assert_confirmed_team_member_count_trigger
  after insert or update or delete on public.team_members
  deferrable initially deferred
  for each row execute function public.assert_confirmed_team_member_count();

create or replace function public.get_competition_interest_counts(
  comp_ids uuid[] default null
)
returns table (
  competition_id uuid,
  interest_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id as competition_id,
    count(i.id)::bigint as interest_count
  from public.competitions c
  left join public.interests i on i.competition_id = c.id
  where (comp_ids is null or c.id = any(comp_ids))
    and (
      c.status in ('open', 'closed')
      or public.is_teacher()
      or public.app_is_system()
    )
  group by c.id;
$$;

revoke all on function public.app_uid() from public;
revoke all on function public.app_is_system() from public;
revoke all on function public.is_teacher() from public;
revoke all on function public.is_confirmed_team_member(uuid) from public;
revoke all on function public.can_view_profile(uuid) from public;
revoke all on function public.get_competition_interest_counts(uuid[]) from public;

-- ----------------------------------------------------------------------------
-- 5. Strict Row Level Security (RLS)
-- ----------------------------------------------------------------------------

alter table public.auth_accounts enable row level security;
alter table public.auth_accounts force row level security;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

alter table public.competitions enable row level security;
alter table public.competitions force row level security;

alter table public.interests enable row level security;
alter table public.interests force row level security;

alter table public.teams enable row level security;
alter table public.teams force row level security;

alter table public.team_members enable row level security;
alter table public.team_members force row level security;

-- auth_accounts: system-only (login / register / cron)
drop policy if exists auth_accounts_system_all on public.auth_accounts;
create policy auth_accounts_system_all
  on public.auth_accounts
  for all
  using (public.app_is_system())
  with check (public.app_is_system());

alter table public.auth_security enable row level security;
alter table public.auth_security force row level security;

drop policy if exists auth_security_system_all on public.auth_security;
create policy auth_security_system_all
  on public.auth_security
  for all
  using (public.app_is_system())
  with check (public.app_is_system());

-- profiles
drop policy if exists profiles_select_policy on public.profiles;
create policy profiles_select_policy
  on public.profiles
  for select
  using (
    public.app_is_system()
    or public.can_view_profile(id)
  );

-- Avatar bytes live outside profiles so authentication queries stay small.
create table if not exists public.profile_avatars (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  data bytea not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  updated_at timestamptz not null default now()
);

alter table public.profile_avatars enable row level security;
alter table public.profile_avatars force row level security;

drop policy if exists profile_avatars_select_self on public.profile_avatars;

drop policy if exists profile_avatars_write_self on public.profile_avatars;
create policy profile_avatars_write_self
  on public.profile_avatars for all
  using (
    user_id = public.app_uid()
    or public.is_teacher()
    or public.app_is_system()
  )
  with check (
    user_id = public.app_uid()
    or public.is_teacher()
    or public.app_is_system()
  );

drop policy if exists profiles_insert_self_student on public.profiles;
create policy profiles_insert_self_student
  on public.profiles
  for insert
  with check (
    public.app_is_system()
    or public.is_teacher()
    or (id = public.app_uid() and role = 'student')
  );

drop policy if exists profiles_update_self_student on public.profiles;
create policy profiles_update_self_student
  on public.profiles
  for update
  using (id = public.app_uid() and not public.is_teacher())
  with check (id = public.app_uid() and role = 'student');

drop policy if exists profiles_teacher_system_all on public.profiles;
create policy profiles_teacher_system_all
  on public.profiles
  for all
  using (public.app_is_system() or public.is_teacher())
  with check (public.app_is_system() or public.is_teacher());

-- competitions
drop policy if exists competitions_select_public on public.competitions;
create policy competitions_select_public
  on public.competitions
  for select
  using (status in ('open', 'closed'));

drop policy if exists competitions_select_own_pending on public.competitions;
create policy competitions_select_own_pending
  on public.competitions
  for select
  using (
    status = 'pending_review'
    and created_by = public.app_uid()
  );

drop policy if exists competitions_insert_student_pending on public.competitions;
create policy competitions_insert_student_pending
  on public.competitions
  for insert
  with check (
    status = 'pending_review'
    and created_by = public.app_uid()
    and source_type in ('ai_link', 'ai_poster')
  );

drop policy if exists competitions_teacher_system_all on public.competitions;
create policy competitions_teacher_system_all
  on public.competitions
  for all
  using (public.app_is_system() or public.is_teacher())
  with check (public.app_is_system() or public.is_teacher());

-- interests
drop policy if exists interests_select_own on public.interests;
create policy interests_select_own
  on public.interests
  for select
  using (user_id = public.app_uid());

drop policy if exists interests_insert_own_open on public.interests;
create policy interests_insert_own_open
  on public.interests
  for insert
  with check (
    user_id = public.app_uid()
    and exists (
      select 1
      from public.competitions c
      where c.id = competition_id
        and c.status = 'open'
    )
  );

drop policy if exists interests_update_own_open on public.interests;
create policy interests_update_own_open
  on public.interests
  for update
  using (user_id = public.app_uid())
  with check (
    user_id = public.app_uid()
    and exists (
      select 1
      from public.competitions c
      where c.id = competition_id
        and c.status = 'open'
    )
  );

drop policy if exists interests_delete_own_open on public.interests;
create policy interests_delete_own_open
  on public.interests
  for delete
  using (
    user_id = public.app_uid()
    and exists (
      select 1
      from public.competitions c
      where c.id = competition_id
        and c.status = 'open'
    )
  );

drop policy if exists interests_teacher_system_all on public.interests;
create policy interests_teacher_system_all
  on public.interests
  for all
  using (public.app_is_system() or public.is_teacher())
  with check (public.app_is_system() or public.is_teacher());

-- teams
drop policy if exists teams_select_confirmed_member on public.teams;
create policy teams_select_confirmed_member
  on public.teams
  for select
  using (
    status = 'confirmed'
    and public.is_confirmed_team_member(id)
  );

drop policy if exists teams_teacher_system_all on public.teams;
create policy teams_teacher_system_all
  on public.teams
  for all
  using (public.app_is_system() or public.is_teacher())
  with check (public.app_is_system() or public.is_teacher());

-- team_members
drop policy if exists team_members_select_confirmed_peer on public.team_members;
create policy team_members_select_confirmed_peer
  on public.team_members
  for select
  using (public.is_confirmed_team_member(team_id));

drop policy if exists team_members_teacher_system_all on public.team_members;
create policy team_members_teacher_system_all
  on public.team_members
  for all
  using (public.app_is_system() or public.is_teacher())
  with check (public.app_is_system() or public.is_teacher());

-- Password reset requests are public-created and teacher-reviewed.
create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.auth_accounts(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','resolved','rejected','expired')),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);

create or replace function public.expire_password_reset_requests()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.password_reset_requests
  set status = 'expired'
  where status = 'pending' and expires_at <= now();
end;
$$;

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.auth_accounts(id) on delete cascade,
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  constraint password_reset_tokens_expiry_future check (expires_at > created_at)
);

create index if not exists password_reset_tokens_active_user_idx
  on public.password_reset_tokens (user_id)
  where used_at is null and revoked_at is null;

alter table public.password_reset_requests enable row level security;
alter table public.password_reset_requests force row level security;
alter table public.password_reset_tokens enable row level security;
alter table public.password_reset_tokens force row level security;

drop policy if exists reset_requests_system_all on public.password_reset_requests;
create policy reset_requests_system_all
  on public.password_reset_requests for all
  using (public.app_is_system()) with check (public.app_is_system());

drop policy if exists reset_tokens_system_all on public.password_reset_tokens;
create policy reset_tokens_system_all
  on public.password_reset_tokens for all
  using (public.app_is_system()) with check (public.app_is_system());

revoke all on function public.expire_password_reset_requests() from public;

-- Applied migration ledger for health checks and the Phase 2 runner.
create table if not exists public.schema_migrations (
  version text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
);

alter table public.schema_migrations enable row level security;
alter table public.schema_migrations force row level security;

drop policy if exists schema_migrations_system_all on public.schema_migrations;
create policy schema_migrations_system_all
  on public.schema_migrations
  for all
  using (public.app_is_system())
  with check (public.app_is_system());

insert into public.schema_migrations (version, checksum)
values ('0001_baseline', 'eb7a935079255d024d521edbfa33e831419811c5b7844a1c487e55c8da724603')
on conflict (version) do nothing;

-- Persistent rate-limit buckets for auth and read-heavy routes.
create table if not exists public.rate_limit_buckets (
  key text primary key,
  hit_count integer not null default 0,
  window_start timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists rate_limit_buckets_expires_at_idx
  on public.rate_limit_buckets (expires_at);

alter table public.rate_limit_buckets enable row level security;
alter table public.rate_limit_buckets force row level security;

drop policy if exists rate_limit_buckets_system_all on public.rate_limit_buckets;
create policy rate_limit_buckets_system_all
  on public.rate_limit_buckets
  for all
  using (public.app_is_system())
  with check (public.app_is_system());

create table if not exists public.user_sessions (
  jti uuid primary key,
  user_id uuid not null references public.auth_accounts(id) on delete cascade,
  user_agent text,
  ip_address text,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists user_sessions_user_active_idx
  on public.user_sessions (user_id)
  where revoked_at is null;

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  template text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','sent','failed')),
  attempts integer not null default 0,
  last_error text,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_outbox_pending_idx
  on public.email_outbox (scheduled_at)
  where status = 'pending';

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);

alter table public.user_sessions enable row level security;
alter table public.user_sessions force row level security;
alter table public.email_outbox enable row level security;
alter table public.email_outbox force row level security;
alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;

drop policy if exists user_sessions_system_all on public.user_sessions;
create policy user_sessions_system_all
  on public.user_sessions for all
  using (public.app_is_system()) with check (public.app_is_system());

drop policy if exists email_outbox_system_all on public.email_outbox;
create policy email_outbox_system_all
  on public.email_outbox for all
  using (public.app_is_system()) with check (public.app_is_system());

drop policy if exists audit_logs_system_read on public.audit_logs;
create policy audit_logs_system_read
  on public.audit_logs for select
  using (public.app_is_system());

drop policy if exists audit_logs_system_insert on public.audit_logs;
create policy audit_logs_system_insert
  on public.audit_logs for insert
  with check (public.app_is_system());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'techhub_app') then
    grant select, insert, update, delete on table public.user_sessions, public.email_outbox to techhub_app;
    grant select, insert on table public.audit_logs to techhub_app;
  end if;
end $$;

create table if not exists public.scout_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_url text not null,
  adapter_type text not null check (adapter_type in ('html-list','rss-feed','json-api')),
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  last_status text,
  consecutive_failures integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.scout_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','completed','failed','cancelled')),
  found_count integer not null default 0,
  inserted_count integer not null default 0,
  duplicate_count integer not null default 0,
  error_log jsonb not null default '[]'::jsonb,
  triggered_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.scout_run_sources (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.scout_runs(id) on delete cascade,
  source_id uuid references public.scout_sources(id) on delete set null,
  source_name text not null,
  status text not null check (status in ('ok','failed','skipped')),
  found_count integer not null default 0,
  error text
);

alter table public.scout_sources enable row level security;
alter table public.scout_sources force row level security;
alter table public.scout_runs enable row level security;
alter table public.scout_runs force row level security;
alter table public.scout_run_sources enable row level security;
alter table public.scout_run_sources force row level security;

drop policy if exists scout_sources_teacher_all on public.scout_sources;
create policy scout_sources_teacher_all on public.scout_sources for all
  using (public.is_teacher() or public.app_is_system())
  with check (public.is_teacher() or public.app_is_system());

drop policy if exists scout_runs_teacher_all on public.scout_runs;
create policy scout_runs_teacher_all on public.scout_runs for all
  using (public.is_teacher() or public.app_is_system())
  with check (public.is_teacher() or public.app_is_system());

drop policy if exists scout_run_sources_teacher_all on public.scout_run_sources;
create policy scout_run_sources_teacher_all on public.scout_run_sources for all
  using (public.is_teacher() or public.app_is_system())
  with check (public.is_teacher() or public.app_is_system());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'techhub_app') then
    grant select, insert, update, delete on table
      public.scout_sources, public.scout_runs, public.scout_run_sources to techhub_app;
  end if;
end $$;


create table if not exists public.competition_bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, competition_id)
);

create table if not exists public.competition_comments (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (btrim(body) <> ''),
  is_pinned boolean not null default false,
  is_official boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.competition_results (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  award_title text not null,
  rank_tier text,
  certificate_url text,
  reflection text,
  verified_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.competition_bookmarks enable row level security;
alter table public.competition_bookmarks force row level security;
alter table public.competition_comments enable row level security;
alter table public.competition_comments force row level security;
alter table public.competition_results enable row level security;
alter table public.competition_results force row level security;

drop policy if exists bookmarks_self_all on public.competition_bookmarks;
create policy bookmarks_self_all on public.competition_bookmarks for all
  using (user_id = public.app_uid() or public.app_is_system())
  with check (user_id = public.app_uid() or public.app_is_system());

drop policy if exists comments_select_visible on public.competition_comments;
create policy comments_select_visible on public.competition_comments for select
  using (
    public.app_is_system() or public.is_teacher() or
    exists (select 1 from public.competitions c where c.id = competition_id and c.status in ('open','closed'))
  );

drop policy if exists comments_insert_own on public.competition_comments;
create policy comments_insert_own on public.competition_comments for insert
  with check (author_id = public.app_uid() or public.is_teacher() or public.app_is_system());

drop policy if exists comments_update_teacher on public.competition_comments;
create policy comments_update_teacher on public.competition_comments for update
  using (public.is_teacher() or public.app_is_system())
  with check (public.is_teacher() or public.app_is_system());

drop policy if exists results_select_visible on public.competition_results;
create policy results_select_visible on public.competition_results for select
  using (public.app_is_system() or public.is_teacher() or exists (select 1 from public.competitions c where c.id = competition_id and c.status in ('open','closed')));

drop policy if exists results_write_teacher on public.competition_results;
create policy results_write_teacher on public.competition_results for all
  using (public.is_teacher() or public.app_is_system())
  with check (public.is_teacher() or public.app_is_system());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'techhub_app') then
    grant select, insert, update, delete on table
      public.competition_bookmarks, public.competition_comments, public.competition_results to techhub_app;
  end if;
end $$;


create table if not exists public.team_tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null check (btrim(title) <> ''),
  assignee_id uuid references public.profiles(id) on delete set null,
  due_date date,
  status text not null default 'todo' check (status in ('todo','doing','done')),
  created_at timestamptz not null default now()
);

create table if not exists public.team_activity_logs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.team_tasks enable row level security;
alter table public.team_tasks force row level security;
alter table public.team_activity_logs enable row level security;
alter table public.team_activity_logs force row level security;

drop policy if exists team_tasks_member_all on public.team_tasks;
create policy team_tasks_member_select on public.team_tasks for select
  using (
    public.app_is_system() or public.is_teacher() or
    exists (
      select 1 from public.team_members tm
      join public.teams t on t.id = tm.team_id
      where tm.team_id = team_id and t.status = 'confirmed' and tm.user_id = public.app_uid()
    )
  );

create policy team_tasks_teacher_all on public.team_tasks for all
  using (public.app_is_system() or public.is_teacher())
  with check (public.app_is_system() or public.is_teacher());

drop policy if exists team_activity_select on public.team_activity_logs;
create policy team_activity_select on public.team_activity_logs for select
  using (
    public.app_is_system() or public.is_teacher() or
    exists (
      select 1 from public.team_members tm
      join public.teams t on t.id = tm.team_id
      where tm.team_id = team_id and t.status = 'confirmed' and tm.user_id = public.app_uid()
    )
  );

drop policy if exists team_activity_insert_teacher on public.team_activity_logs;
create policy team_activity_insert_teacher on public.team_activity_logs for insert
  with check (public.app_is_system() or public.is_teacher());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'techhub_app') then
    grant select, insert, update, delete on table public.team_tasks to techhub_app;
    grant select, insert on table public.team_activity_logs to techhub_app;
  end if;
end $$;


-- In-app notifications and per-user notification preferences.
-- Both tables are system-only under FORCE RLS. Authenticated request code must
-- authorize in the application layer, then use withSystemDb for these tables.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.auth_accounts(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 40),
  title text not null check (char_length(title) between 1 and 200),
  body text,
  href text check (href is null or (href like '/%' and href not like '//%')),
  competition_id uuid references public.competitions(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_user_dedupe_key unique (user_id, dedupe_key)
);

create index if not exists notifications_user_created_at_idx
  on public.notifications (user_id, created_at desc);

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.auth_accounts(id) on delete cascade,
  deadline_reminders boolean not null default true,
  team_assigned_notices boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.handle_updated_at();

insert into public.notification_preferences (user_id)
select id from public.auth_accounts
on conflict (user_id) do nothing;

alter table public.notifications enable row level security;
alter table public.notifications force row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_preferences force row level security;

do $$
declare
  v_policy record;
begin
  for v_policy in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('notifications', 'notification_preferences')
  loop
    execute format('drop policy %I on public.%I', v_policy.policyname, v_policy.tablename);
  end loop;
end $$;

create policy notifications_system_all
  on public.notifications for all
  using (public.app_is_system()) with check (public.app_is_system());

create policy notification_preferences_system_all
  on public.notification_preferences for all
  using (public.app_is_system()) with check (public.app_is_system());

revoke all on table public.notifications, public.notification_preferences from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'techhub_app') then
    grant usage on schema public to techhub_app;
    grant select, insert, update, delete on table
      public.notifications,
      public.notification_preferences
    to techhub_app;
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- 6. Grants for Non-Superuser App Role (techhub_app)
-- ----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'techhub_app') then
    grant usage on schema public to techhub_app;
    grant select, insert, update, delete on table
      public.auth_accounts,
      public.auth_security,
      public.profiles,
      public.competitions,
      public.interests,
      public.teams,
      public.team_members,
      public.profile_avatars,
      public.password_reset_requests,
      public.password_reset_tokens,
      public.rate_limit_buckets,
      public.schema_migrations,
      public.user_sessions,
      public.email_outbox
    to techhub_app;

    grant select, insert on table public.audit_logs to techhub_app;

    grant execute on function
      public.app_uid(),
      public.app_is_system(),
      public.is_teacher(),
      public.app_session_version(),
      public.is_confirmed_team_member(uuid),
      public.can_view_profile(uuid),
      public.get_competition_interest_counts(uuid[]),
      public.expire_password_reset_requests()
    to techhub_app;
  end if;
end $$;

-- Directory reads never widen profiles RLS. These functions return a fixed
-- fixed-column DTO only, require a live caller, and reject system mode.
drop function if exists public.query_profile_directory(text, integer, integer);
create or replace function public.query_profile_directory(
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  full_name text,
  nickname text,
  grade text,
  skills text[],
  role text,
  avatar_url text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.app_uid() is null or public.app_is_system() then
    return;
  end if;

  return query
  select p.id, p.full_name, p.nickname, p.grade, p.skills, p.role, p.avatar_url
  from public.profiles p
  where p.directory_visible
    and (
      p_query is null
      or btrim(p_query) = ''
      or strpos(lower(p.full_name), lower(p_query)) > 0
      or strpos(lower(coalesce(p.nickname, '')), lower(p_query)) > 0
      or exists (
        select 1 from unnest(p.skills) as skill
        where strpos(lower(skill), lower(p_query)) > 0
      )
    )
  order by p.full_name asc, p.id asc
  limit least(greatest(coalesce(p_limit, 50), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

drop function if exists public.get_directory_profile(uuid);
create or replace function public.get_directory_profile(p_id uuid)
returns table (
  id uuid,
  full_name text,
  nickname text,
  grade text,
  skills text[],
  role text,
  avatar_url text,
  bio text,
  github_url text,
  portfolio_url text,
  discord_url text,
  line_url text,
  contact text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.app_uid() is null or public.app_is_system() then
    return;
  end if;

  return query
  select p.id, p.full_name, p.nickname, p.grade, p.skills, p.role, p.avatar_url, p.bio, p.github_url, p.portfolio_url, p.discord_url, p.line_url, p.contact
  from public.profiles p
  where p.id = p_id
    and p.directory_visible
   ;
end;
$$;

revoke all on function public.query_profile_directory(text, integer, integer) from public;
revoke all on function public.get_directory_profile(uuid) from public;

drop policy if exists profile_avatars_select_self on public.profile_avatars;
drop policy if exists profile_avatars_select_visible on public.profile_avatars;
create policy profile_avatars_select_visible
  on public.profile_avatars for select
  using (
    user_id = public.app_uid()
    or public.is_teacher()
    or public.app_is_system()
    or exists (
      select 1 from public.get_directory_profile(user_id)
    )
  );

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'techhub_app') then
    grant execute on function public.query_profile_directory(text, integer, integer) to techhub_app;
    grant execute on function public.get_directory_profile(uuid) to techhub_app;
  end if;
end $$;

create or replace function public.ensure_notification_preferences()
returns trigger
language plpgsql
as $$
begin
  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists ensure_notification_preferences_trigger on public.auth_accounts;
create trigger ensure_notification_preferences_trigger
  after insert on public.auth_accounts
  for each row execute function public.ensure_notification_preferences();

insert into public.notification_preferences (user_id)
select id from public.auth_accounts
on conflict (user_id) do nothing;

-- ----------------------------------------------------------------------------
-- Tip: Promote the first teacher account after registering via UI:
-- UPDATE public.profiles SET role = 'teacher' WHERE lower(email) = 'teacher@school.ac.th';
-- ----------------------------------------------------------------------------

-- ============================================================================
-- Wave 2 migrations 0010 through 0014 mirrored for fresh-boot parity.
-- ============================================================================

-- mirrored from db/migrations/0010_student_teams.sql
-- Phase 9: student-led team formation and recruitment.
-- The migration runner already wraps this file in one transaction.

alter table public.competitions add column if not exists team_formation_mode text not null default 'teacher'
  check (team_formation_mode in ('teacher', 'student', 'hybrid'));

alter table public.teams add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.teams add column if not exists formation_source text not null default 'teacher'
  check (formation_source in ('teacher', 'student'));
alter table public.teams add column if not exists teacher_approved boolean not null default false;
alter table public.teams add column if not exists recruitment_locked boolean not null default false;

create index if not exists teams_student_formation_idx
  on public.teams (competition_id, formation_source, status);

create table if not exists public.team_open_roles (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  role text not null check (btrim(role) <> ''),
  slots integer not null default 1 check (slots between 1 and 10),
  status text not null default 'open' check (status in ('open', 'paused', 'closed')),
  note text check (note is null or char_length(note) <= 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, role)
);

create index if not exists team_open_roles_team_status_idx
  on public.team_open_roles (team_id, status);

create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  direction text not null check (direction in ('team_invite', 'join_request')),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  open_role_id uuid references public.team_open_roles(id) on delete set null,
  role text not null check (btrim(role) <> ''),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint team_invitations_distinct_parties check (sender_id <> recipient_id)
);

create index if not exists team_invitations_team_status_idx
  on public.team_invitations (team_id, status);

create index if not exists team_invitations_recipient_status_idx
  on public.team_invitations (recipient_id, status);

create unique index if not exists team_invitations_pending_pair_idx
  on public.team_invitations (team_id, direction, sender_id, recipient_id, role)
  where status = 'pending';

drop trigger if exists set_team_open_roles_updated_at on public.team_open_roles;
create trigger set_team_open_roles_updated_at
  before update on public.team_open_roles
  for each row execute function public.handle_updated_at();

create or replace function public.is_directory_visible_student(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_user_id is not null
    and p_user_id <> public.app_uid()
    and exists (
      select 1 from public.profiles p
      where p.id = p_user_id
        and p.role = 'student'
        and p.directory_visible
    );
$$;

create or replace function public.is_student_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.app_is_system()
    or public.is_teacher()
    or exists (
      select 1
      from public.teams t
      join public.team_members tm on tm.team_id = t.id
      where t.id = p_team_id
        and t.formation_source = 'student'
        and tm.user_id = public.app_uid()
    );
$$;

create or replace function public.is_student_team_owner(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.app_is_system()
    or public.is_teacher()
    or exists (
      select 1
      from public.teams t
      where t.id = p_team_id
        and t.formation_source = 'student'
        and t.created_by = public.app_uid()
    );
$$;

create or replace function public.student_team_recruitment_open(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.app_uid() is not null
    and exists (
      select 1
      from public.teams t
      join public.competitions c on c.id = t.competition_id
      where t.id = p_team_id
        and t.formation_source = 'student'
        and t.status = 'draft'
        and not t.recruitment_locked
        and c.status = 'open'
        and c.team_formation_mode in ('student', 'hybrid')
        and (c.deadline is null or c.deadline >= current_date)
    );
$$;

create or replace function public.student_team_member_count(
  p_team_id uuid,
  p_user_id uuid default null
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.team_members tm
  where tm.team_id = p_team_id
    and (p_user_id is null or tm.user_id = p_user_id);
$$;

create or replace function public.student_team_open_role_taken(p_role_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.team_open_roles r
  join public.team_members tm
    on tm.team_id = r.team_id
   and lower(btrim(tm.assigned_role)) = lower(btrim(r.role))
  where r.id = p_role_id;
$$;

create or replace function public.can_join_student_team(p_team_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_user_id is not null
    and (
      (
        p_user_id = public.app_uid()
        and public.is_student_team_owner(p_team_id)
      )
      or exists (
        select 1
        from public.team_invitations i
        where i.team_id = p_team_id
          and i.status = 'pending'
          and (
            (
              i.direction = 'team_invite'
              and i.recipient_id = p_user_id
              and public.app_uid() = p_user_id
            )
            or (
              i.direction = 'join_request'
              and i.sender_id = p_user_id
              and public.is_student_team_owner(p_team_id)
            )
          )
      )
    );
$$;

create or replace function public.query_student_team_candidates(
  p_competition_id uuid,
  p_exclude_user_id uuid default null
)
returns table (
  id uuid,
  full_name text,
  nickname text,
  grade text,
  skills text[],
  preferred_role text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.nickname, p.grade, p.skills, i.preferred_role
  from public.profiles p
  join public.interests i on i.user_id = p.id
  where public.app_uid() is not null
    and not public.app_is_system()
    and p.directory_visible
    and p.role = 'student'
    and i.competition_id = p_competition_id
    and (p_exclude_user_id is null or p.id <> p_exclude_user_id)
  order by p.full_name asc, p.id asc
  limit 50;
$$;

revoke all on function public.is_directory_visible_student(uuid) from public;
revoke all on function public.is_student_team_member(uuid) from public;
revoke all on function public.is_student_team_owner(uuid) from public;
revoke all on function public.student_team_recruitment_open(uuid) from public;
revoke all on function public.student_team_member_count(uuid, uuid) from public;
revoke all on function public.student_team_open_role_taken(uuid) from public;
revoke all on function public.can_join_student_team(uuid, uuid) from public;
revoke all on function public.query_student_team_candidates(uuid, uuid) from public;

alter table public.team_open_roles enable row level security;
alter table public.team_open_roles force row level security;
alter table public.team_invitations enable row level security;
alter table public.team_invitations force row level security;

drop policy if exists team_open_roles_select on public.team_open_roles;
create policy team_open_roles_select
  on public.team_open_roles for select
  using (
    public.app_is_system()
    or public.is_teacher()
    or public.is_student_team_member(team_id)
    or (
      status = 'open'
      and public.student_team_recruitment_open(team_id)
    )
  );

drop policy if exists team_open_roles_member_write on public.team_open_roles;
create policy team_open_roles_member_write
  on public.team_open_roles for all
  using (
    public.app_is_system()
    or public.is_student_team_owner(team_id)
  )
  with check (
    public.app_is_system()
    or (
      public.is_student_team_owner(team_id)
      and public.student_team_recruitment_open(team_id)
    )
  );

drop policy if exists team_invitations_select on public.team_invitations;
create policy team_invitations_select
  on public.team_invitations for select
  using (
    public.app_is_system()
    or public.is_teacher()
    or sender_id = public.app_uid()
    or recipient_id = public.app_uid()
  );

drop policy if exists team_invitations_insert on public.team_invitations;
create policy team_invitations_insert
  on public.team_invitations for insert
  with check (
    public.app_uid() is not null
    and sender_id = public.app_uid()
    and public.student_team_recruitment_open(team_id)
    and (select p.role from public.profiles p where p.id = public.app_uid()) = 'student'
    and (
      (
        direction = 'team_invite'
        and public.is_student_team_owner(team_id)
        and public.is_directory_visible_student(recipient_id)
      )
      or (
        direction = 'join_request'
        and recipient_id = (select t.created_by from public.teams t where t.id = team_id)
      )
    )
  );

drop policy if exists team_invitations_recipient_update on public.team_invitations;
create policy team_invitations_recipient_update
  on public.team_invitations for update
  using (recipient_id = public.app_uid() and status = 'pending')
  with check (recipient_id = public.app_uid() and status in ('accepted', 'declined'));

drop policy if exists team_invitations_sender_update on public.team_invitations;
create policy team_invitations_sender_update
  on public.team_invitations for update
  using (sender_id = public.app_uid() and status = 'pending')
  with check (sender_id = public.app_uid() and status = 'revoked');

drop policy if exists team_invitations_teacher_all on public.team_invitations;
create policy team_invitations_teacher_all
  on public.team_invitations for all
  using (public.app_is_system() or public.is_teacher())
  with check (public.app_is_system() or public.is_teacher());

drop policy if exists teams_insert_student_draft on public.teams;
create policy teams_insert_student_draft
  on public.teams for insert
  with check (
    formation_source = 'student'
    and status = 'draft'
    and created_by = public.app_uid()
    and not teacher_approved
    and not recruitment_locked
    and exists (
      select 1 from public.competitions c
      where c.id = competition_id
        and c.status = 'open'
        and c.team_formation_mode in ('student', 'hybrid')
    )
  );

drop policy if exists teams_select_student_draft on public.teams;
create policy teams_select_student_draft
  on public.teams for select
  using (
    formation_source = 'student'
    and status = 'draft'
    and public.is_student_team_member(id)
  );

drop policy if exists teams_select_student_invited on public.teams;
create policy teams_select_student_invited
  on public.teams for select
  using (
    formation_source = 'student'
    and status = 'draft'
    and exists (
      select 1 from public.team_invitations i
      where i.team_id = id
        and i.status in ('pending', 'accepted')
        and (i.sender_id = public.app_uid() or i.recipient_id = public.app_uid())
    )
  );

drop policy if exists team_members_select_student_draft on public.team_members;
create policy team_members_select_student_draft
  on public.team_members for select
  using (
    public.is_student_team_member(team_id)
  );

drop policy if exists team_members_insert_student_draft on public.team_members;
create policy team_members_insert_student_draft
  on public.team_members for insert
  with check (
    public.student_team_recruitment_open(team_id)
    and public.can_join_student_team(team_id, user_id)
  );

drop policy if exists team_members_delete_student_draft on public.team_members;
create policy team_members_delete_student_draft
  on public.team_members for delete
  using (
    user_id = public.app_uid()
    and exists (
      select 1 from public.teams t
      where t.id = team_id
        and t.formation_source = 'student'
        and t.status = 'draft'
        and not t.recruitment_locked
    )
  );

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'techhub_app') then
    grant select, insert, update, delete on table
      public.team_open_roles,
      public.team_invitations
    to techhub_app;

    grant execute on function
      public.is_directory_visible_student(uuid),
      public.is_student_team_member(uuid),
      public.is_student_team_owner(uuid),
      public.student_team_recruitment_open(uuid),
      public.student_team_member_count(uuid, uuid),
      public.student_team_open_role_taken(uuid),
      public.can_join_student_team(uuid, uuid),
      public.query_student_team_candidates(uuid, uuid)
    to techhub_app;
  end if;
end $$;


-- mirrored from db/migrations/0011_prep_studio.sql
begin;

create table if not exists public.team_ai_plans (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  kind text not null check (kind in ('roadmap', 'rubric_review')),
  input_hash text not null check (btrim(input_hash) <> ''),
  model text not null check (btrim(model) <> ''),
  plan jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, kind, input_hash)
);

create index if not exists team_ai_plans_team_kind_updated_idx
  on public.team_ai_plans (team_id, kind, updated_at desc);

create table if not exists public.team_deliverables (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null check (btrim(title) <> ''),
  kind text not null check (kind in ('source_code', 'prototype', 'document', 'demo_video', 'other')),
  url text not null check (btrim(url) <> ''),
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_deliverables_team_created_idx
  on public.team_deliverables (team_id, created_at desc);

alter table public.team_ai_plans enable row level security;
alter table public.team_ai_plans force row level security;
alter table public.team_deliverables enable row level security;
alter table public.team_deliverables force row level security;

drop policy if exists team_ai_plans_member_all on public.team_ai_plans;
create policy team_ai_plans_member_all on public.team_ai_plans for all
  using (
    public.app_is_system() or public.is_teacher() or
    public.is_confirmed_team_member(team_id)
  )
  with check (
    public.app_is_system() or public.is_teacher() or
    public.is_confirmed_team_member(team_id)
  );

drop policy if exists team_deliverables_select on public.team_deliverables;
create policy team_deliverables_select on public.team_deliverables for select
  using (
    public.app_is_system() or public.is_teacher() or
    public.is_confirmed_team_member(team_id)
  );

drop policy if exists team_deliverables_insert on public.team_deliverables;
create policy team_deliverables_insert on public.team_deliverables for insert
  with check (
    (public.app_is_system() or public.is_teacher() or public.is_confirmed_team_member(team_id))
    and (public.app_is_system() or public.is_teacher() or created_by = public.app_uid())
  );

drop policy if exists team_deliverables_update on public.team_deliverables;
create policy team_deliverables_update on public.team_deliverables for update
  using (
    public.app_is_system() or public.is_teacher() or
    (public.is_confirmed_team_member(team_id) and created_by = public.app_uid())
  )
  with check (
    public.app_is_system() or public.is_teacher() or
    (public.is_confirmed_team_member(team_id) and created_by = public.app_uid())
  );

drop policy if exists team_deliverables_delete on public.team_deliverables;
create policy team_deliverables_delete on public.team_deliverables for delete
  using (
    public.app_is_system() or public.is_teacher() or
    (public.is_confirmed_team_member(team_id) and created_by = public.app_uid())
  );

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'techhub_app') then
    grant select, insert, update, delete on table
      public.team_ai_plans, public.team_deliverables
    to techhub_app;
  end if;
end $$;

commit;


-- mirrored from db/migrations/0012_collab_checkins.sql
-- Phase 11: team chat, weekly mentor check-ins, and scoped realtime reads.
-- Rows are readable by confirmed team members, the assigned advisor,
-- teachers/admins, and system jobs. Students may only write as themselves.

begin;

create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  mentions uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now()
);

create index if not exists team_messages_team_created_at_idx
  on public.team_messages (team_id, created_at desc, id desc);

create table if not exists public.team_checkins (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  progress text not null check (char_length(btrim(progress)) between 1 and 2000),
  blockers text check (blockers is null or char_length(btrim(blockers)) <= 2000),
  next_steps text not null check (char_length(btrim(next_steps)) between 1 and 2000),
  risk_level text not null default 'on_track'
    check (risk_level in ('on_track', 'at_risk', 'blocked')),
  mentor_note text check (mentor_note is null or char_length(btrim(mentor_note)) <= 2000),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_checkins_team_week_unique unique (team_id, week_start)
);

create index if not exists team_checkins_team_week_idx
  on public.team_checkins (team_id, week_start desc);

create index if not exists team_checkins_risk_updated_at_idx
  on public.team_checkins (risk_level, updated_at desc);

drop trigger if exists set_team_checkins_updated_at on public.team_checkins;
create trigger set_team_checkins_updated_at
  before update on public.team_checkins
  for each row execute function public.handle_updated_at();

create or replace function public.can_access_team_collab(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams t
    left join public.team_members tm
      on tm.team_id = t.id
     and tm.user_id = public.app_uid()
    where t.id = target_team_id
      and t.status = 'confirmed'
      and (
        public.app_is_system()
        or public.is_teacher()
        or t.advisor_id = public.app_uid()
        or tm.user_id is not null
      )
  );
$$;

alter table public.team_messages enable row level security;
alter table public.team_messages force row level security;
alter table public.team_checkins enable row level security;
alter table public.team_checkins force row level security;

do $$
declare
  v_policy record;
begin
  for v_policy in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('team_messages', 'team_checkins')
  loop
    execute format('drop policy %I on public.%I', v_policy.policyname, v_policy.tablename);
  end loop;
end $$;

create policy team_messages_select on public.team_messages for select
  using (public.can_access_team_collab(team_id));

create policy team_messages_insert on public.team_messages for insert
  with check (
    public.can_access_team_collab(team_id)
    and (public.app_is_system() or author_id = public.app_uid())
  );

create policy team_checkins_select on public.team_checkins for select
  using (public.can_access_team_collab(team_id));

create policy team_checkins_insert on public.team_checkins for insert
  with check (
    public.can_access_team_collab(team_id)
    and (public.app_is_system() or author_id = public.app_uid())
  );

create policy team_checkins_update on public.team_checkins for update
  using (
    public.can_access_team_collab(team_id)
    and (
      public.app_is_system()
      or public.is_teacher()
      or author_id = public.app_uid()
    )
  )
  with check (
    public.can_access_team_collab(team_id)
    and (
      public.app_is_system()
      or public.is_teacher()
      or author_id = public.app_uid()
    )
  );

revoke all on table public.team_messages, public.team_checkins from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'techhub_app') then
    grant usage on schema public to techhub_app;
    grant select, insert, update, delete on table
      public.team_messages,
      public.team_checkins
    to techhub_app;
    grant execute on function public.can_access_team_collab(uuid) to techhub_app;
  end if;
end $$;

commit;


-- mirrored from db/migrations/0013_integrations_showcase.sql
-- Calendar subscriptions, admin webhook routing, and curated public showcase.
-- New tables use FORCE RLS; the showcase projection is a curated security
-- definer function so anonymous readers never need a privileged DB context.

begin;

alter table public.teams add column if not exists is_public_showcase boolean not null default false;
alter table public.competition_results add column if not exists is_public_showcase boolean not null default false;

create index if not exists competition_results_public_showcase_idx
  on public.competition_results (created_at desc)
  where is_public_showcase;

create table if not exists public.calendar_feed_tokens (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  token_hash text not null unique
    check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.webhook_routes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> '' and char_length(name) <= 80),
  target_url text not null check (char_length(target_url) <= 2048),
  events text[] not null default array['result.verified']::text[],
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  constraint webhook_routes_events_check check (
    cardinality(events) between 1 and 10
    and events <@ array['result.verified', 'team.confirmed', 'competition.opened']::text[]
  )
);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.webhook_routes(id) on delete cascade,
  event_type text not null check (
    event_type in ('result.verified', 'team.confirmed', 'competition.opened', 'webhook.test')
  ),
  status text not null check (status in ('sent', 'failed')),
  http_status integer,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists webhook_deliveries_route_created_idx
  on public.webhook_deliveries (route_id, created_at desc);

alter table public.calendar_feed_tokens enable row level security;
alter table public.calendar_feed_tokens force row level security;
alter table public.webhook_routes enable row level security;
alter table public.webhook_routes force row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.webhook_deliveries force row level security;

drop policy if exists calendar_feed_tokens_self_all on public.calendar_feed_tokens;
create policy calendar_feed_tokens_self_all on public.calendar_feed_tokens for all
  using (user_id = public.app_uid() or public.app_is_system())
  with check (user_id = public.app_uid() or public.app_is_system());

drop policy if exists webhook_routes_teacher_all on public.webhook_routes;
create policy webhook_routes_teacher_all on public.webhook_routes for all
  using (public.app_is_system() or public.is_teacher())
  with check (public.app_is_system() or public.is_teacher());

drop policy if exists webhook_deliveries_teacher_all on public.webhook_deliveries;
create policy webhook_deliveries_teacher_all on public.webhook_deliveries for all
  using (public.app_is_system() or public.is_teacher())
  with check (public.app_is_system() or public.is_teacher());

revoke all on table
  public.calendar_feed_tokens,
  public.webhook_routes,
  public.webhook_deliveries from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'techhub_app') then
    grant usage on schema public to techhub_app;
    grant select, insert, update, delete on table
      public.calendar_feed_tokens,
      public.webhook_routes,
      public.webhook_deliveries
    to techhub_app;
  end if;
end $$;

-- Only opted-in, teacher-verified results on confirmed teams are exposed.
create or replace function public.get_public_showcase_results()
returns table (
  id uuid,
  competition_id uuid,
  competition_title text,
  category text,
  team_id uuid,
  team_name text,
  award_title text,
  rank_tier text,
  reflection text,
  verified_by_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id,
         r.competition_id,
         c.title,
         c.category,
         r.team_id,
         t.name,
         r.award_title,
         r.rank_tier,
         r.reflection,
         v.full_name,
         r.created_at
  from public.competition_results r
  join public.competitions c on c.id = r.competition_id
  join public.teams t on t.id = r.team_id
  join public.profiles v on v.id = r.verified_by
  where r.is_public_showcase
    and t.is_public_showcase
    and t.status = 'confirmed'
    and r.verified_by is not null
    and v.role = 'teacher'
    and c.status in ('open', 'closed')
  order by r.created_at desc
  limit 50
$$;

revoke all on function public.get_public_showcase_results() from public;
grant execute on function public.get_public_showcase_results() to techhub_app;

commit;


-- mirrored from db/migrations/0014_badges_reports.sql
begin;

-- Phase 13: verified badges, skill evidence and Thai academic-year reports.
-- Badge awards are derived from existing activity rows; students never write
-- badges directly. Both tables use FORCE ROW LEVEL SECURITY.

create table if not exists public.badge_definitions (
  code text primary key check (btrim(code) <> ''),
  name_th text not null check (btrim(name_th) <> ''),
  description_th text not null check (btrim(description_th) <> ''),
  category text not null check (category in ('academic', 'collaboration', 'milestone')),
  icon_name text not null check (
    icon_name in (
      'Award', 'Users', 'Target', 'CheckCircle2',
      'GraduationCap', 'Trophy', 'FolderCheck'
    )
  ),
  tier text not null check (tier in ('bronze', 'silver', 'gold')),
  criterion text not null check (
    criterion in (
      'interest_count', 'confirmed_team_count', 'completed_task_count',
      'verified_award_count', 'champion_award_count', 'verified_skill_count',
      'portfolio_link_count'
    )
  ),
  threshold integer not null default 1 check (threshold >= 1),
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table if not exists public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_code text not null references public.badge_definitions(code) on delete cascade,
  evidence_count integer not null default 1 check (evidence_count >= 0),
  awarded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, badge_code)
);

create index if not exists user_badges_awarded_at_idx
  on public.user_badges (awarded_at desc);

-- Team tasks gain an explicit completion timestamp so a completed-task badge
-- and the academic-year report count real completion, not a due date.
alter table public.team_tasks add column if not exists completed_at timestamptz;

create or replace function public.set_team_task_completion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'done' then
    new.completed_at = coalesce(new.completed_at, now());
  else
    new.completed_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists set_team_task_completion_trigger on public.team_tasks;
create trigger set_team_task_completion_trigger
  before insert or update of status on public.team_tasks
  for each row execute function public.set_team_task_completion();

-- Thai school academic year: 1 May BE YYYY through 30 April BE YYYY+1.
create or replace function public.thai_academic_year_range(p_be_year integer)
returns table (start_at timestamptz, end_at timestamptz, label_th text)
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_be_year is null or p_be_year < 2500 or p_be_year > 2600 then
    raise exception 'ปีการศึกษาไม่ถูกต้อง';
  end if;

  return query
  select
    (make_date(p_be_year - 543, 5, 1)::timestamp at time zone 'Asia/Bangkok'),
    ((make_date(p_be_year - 542, 4, 30) + 1)::timestamp at time zone 'Asia/Bangkok')
      - interval '1 microsecond',
    'ปีการศึกษา ' || p_be_year::text;
end;
$$;

-- Verified evidence is a closed competition with a teacher-verified result,
-- counted once per competition and per skill from team roles and tech hints.
create or replace function public.get_verified_skill_evidence(
  p_user_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  skill text,
  evidence_count integer,
  role_labels text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (
    public.app_is_system()
    or p_user_id = public.app_uid()
    or public.is_teacher()
    or public.can_view_profile(p_user_id)
    or exists (
      select 1 from public.profiles p
      where p.id = p_user_id and p.directory_visible
    )
  ) then
    return;
  end if;

  return query
  with verified_results as (
    select distinct
      cr.id as result_id,
      cr.competition_id,
      cr.team_id,
      c.tech_stack_hints
    from public.competition_results cr
    join public.competitions c on c.id = cr.competition_id and c.status = 'closed'
    join public.teams t on t.id = cr.team_id and t.status = 'confirmed'
    where cr.verified_by is not null
      and (p_from is null or cr.created_at >= p_from)
      and (p_to is null or cr.created_at <= p_to)
  ),
  evidence_items as (
    select
      tm.user_id,
      vr.competition_id,
      lower(btrim(tm.assigned_role)) as skill,
      tm.assigned_role as role_label
    from verified_results vr
    join public.team_members tm on tm.team_id = vr.team_id

    union all

    select
      tm.user_id,
      vr.competition_id,
      lower(btrim(hint)) as skill,
      tm.assigned_role as role_label
    from verified_results vr
    join public.team_members tm on tm.team_id = vr.team_id
    cross join lateral unnest(vr.tech_stack_hints) as hint
  )
  select
    ei.skill,
    count(distinct ei.competition_id)::integer as evidence_count,
    coalesce(
      array_agg(distinct ei.role_label) filter (where btrim(ei.role_label) <> ''),
      array[]::text[]
    ) as role_labels
  from evidence_items ei
  where ei.user_id = p_user_id and btrim(ei.skill) <> ''
  group by ei.skill
  order by count(distinct ei.competition_id) desc, ei.skill asc;
end;
$$;

-- Recomputes all automatic badge rows for one profile. The previous
-- system_mode value is restored in every path so a user transaction is never
-- left privileged.
create or replace function public.refresh_user_badges(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_mode text := current_setting('app.system_mode', true);
  v_interests integer := 0;
  v_teams integer := 0;
  v_tasks integer := 0;
  v_awards integer := 0;
  v_champions integer := 0;
  v_skills integer := 0;
  v_portfolio integer := 0;
begin
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    return;
  end if;

  perform set_config('app.system_mode', 'on', true);

  select count(*)::integer into v_interests
  from public.interests i
  where i.user_id = p_user_id;

  select count(distinct t.id)::integer into v_teams
  from public.team_members tm
  join public.teams t on t.id = tm.team_id
  where tm.user_id = p_user_id and t.status = 'confirmed';

  select count(*)::integer into v_tasks
  from public.team_tasks tt
  where tt.assignee_id = p_user_id and tt.status = 'done';

  select count(distinct cr.id)::integer into v_awards
  from public.competition_results cr
  join public.teams t on t.id = cr.team_id
  join public.team_members tm on tm.team_id = t.id
  where tm.user_id = p_user_id and cr.verified_by is not null;

  select count(distinct cr.id)::integer into v_champions
  from public.competition_results cr
  join public.teams t on t.id = cr.team_id
  join public.team_members tm on tm.team_id = t.id
  where tm.user_id = p_user_id
    and cr.verified_by is not null
    and (
      lower(btrim(coalesce(cr.rank_tier, ''))) in (
        '1', '1st', 'first', 'first place', 'winner', 'champion', 'gold',
        'ชนะเลิศ', 'รางวัลที่ 1'
      )
      or lower(btrim(coalesce(cr.award_title, ''))) like '%ชนะเลิศ%'
    );

  select count(*)::integer into v_skills
  from public.get_verified_skill_evidence(p_user_id);

  select case
    when nullif(btrim(coalesce(p.github_url, '')), '') is not null
      or nullif(btrim(coalesce(p.portfolio_url, '')), '') is not null
    then 1 else 0
  end into v_portfolio
  from public.profiles p
  where p.id = p_user_id;

  insert into public.user_badges (user_id, badge_code, evidence_count)
  select p_user_id, candidate.code, candidate.count
  from (
    values
      ('first_interest', v_interests),
      ('interest_explorer', v_interests),
      ('first_confirmed_team', v_teams),
      ('team_collaborator', v_teams),
      ('task_five', v_tasks),
      ('task_ten', v_tasks),
      ('verified_award', v_awards),
      ('champion_award', v_champions),
      ('skill_evidence_three', v_skills),
      ('portfolio_ready', v_portfolio)
  ) as candidate(code, count)
  join public.badge_definitions d on d.code = candidate.code
  where d.is_active and candidate.count >= d.threshold
  on conflict (user_id, badge_code) do update
  set evidence_count = excluded.evidence_count, updated_at = now();

  perform set_config(
    'app.system_mode',
    coalesce(v_previous_mode, 'off'),
    true
  );
exception when others then
  perform set_config(
    'app.system_mode',
    coalesce(v_previous_mode, 'off'),
    true
  );
  raise;
end;
$$;

create or replace function public.refresh_badges_after_interest()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.refresh_user_badges(new.user_id);
  return new;
end;
$$;

drop trigger if exists refresh_badges_after_interest_trigger on public.interests;
create trigger refresh_badges_after_interest_trigger
  after insert on public.interests
  for each row execute function public.refresh_badges_after_interest();

create or replace function public.refresh_badges_after_team_member()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
begin
  perform public.refresh_user_badges(v_user_id);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_badges_after_team_member_trigger on public.team_members;
create trigger refresh_badges_after_team_member_trigger
  after insert or update of assigned_role on public.team_members
  for each row execute function public.refresh_badges_after_team_member();

create or replace function public.refresh_badges_after_team_status()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    for v_user_id in
      select tm.user_id from public.team_members tm where tm.team_id = new.id
    loop
      perform public.refresh_user_badges(v_user_id);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_badges_after_team_status_trigger on public.teams;
create trigger refresh_badges_after_team_status_trigger
  after update of status on public.teams
  for each row execute function public.refresh_badges_after_team_status();

create or replace function public.refresh_badges_after_result()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if new.verified_by is not null and new.team_id is not null then
    for v_user_id in
      select tm.user_id from public.team_members tm where tm.team_id = new.team_id
    loop
      perform public.refresh_user_badges(v_user_id);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_badges_after_result_trigger on public.competition_results;
create trigger refresh_badges_after_result_trigger
  after insert or update of verified_by, team_id on public.competition_results
  for each row execute function public.refresh_badges_after_result();

create or replace function public.refresh_badges_after_task()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_previous_status text;
begin
  if tg_op = 'INSERT' then
    v_previous_status := null;
  else
    v_previous_status := old.status;
  end if;

  if new.status = 'done'
    and v_previous_status is distinct from 'done'
    and new.assignee_id is not null then
    perform public.refresh_user_badges(new.assignee_id);
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_badges_after_task_trigger on public.team_tasks;
create trigger refresh_badges_after_task_trigger
  after insert or update of status, assignee_id on public.team_tasks
  for each row execute function public.refresh_badges_after_task();

create or replace function public.refresh_badges_after_competition_close()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    for v_user_id in
      select distinct tm.user_id
      from public.teams t
      join public.team_members tm on tm.team_id = t.id
      where t.competition_id = new.id and t.status = 'confirmed'
    loop
      perform public.refresh_user_badges(v_user_id);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_badges_after_competition_close_trigger on public.competitions;
create trigger refresh_badges_after_competition_close_trigger
  after update of status on public.competitions
  for each row execute function public.refresh_badges_after_competition_close();

create or replace function public.refresh_badges_after_profile_links()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.refresh_user_badges(new.id);
  return new;
end;
$$;

drop trigger if exists refresh_badges_after_profile_links_trigger on public.profiles;
create trigger refresh_badges_after_profile_links_trigger
  after update of github_url, portfolio_url on public.profiles
  for each row execute function public.refresh_badges_after_profile_links();

alter table public.badge_definitions enable row level security;
alter table public.badge_definitions force row level security;
alter table public.user_badges enable row level security;
alter table public.user_badges force row level security;

drop policy if exists badge_definitions_select_all on public.badge_definitions;
create policy badge_definitions_select_all
  on public.badge_definitions for select
  using (true);

drop policy if exists user_badges_select_visible on public.user_badges;
create policy user_badges_select_visible
  on public.user_badges for select
  using (
    public.app_is_system()
    or user_id = public.app_uid()
    or public.can_view_profile(user_id)
    or exists (
      select 1 from public.profiles p
      where p.id = user_id and p.directory_visible
    )
  );

drop policy if exists user_badges_system_write on public.user_badges;
create policy user_badges_system_write
  on public.user_badges for all
  using (public.app_is_system())
  with check (public.app_is_system());

revoke all on table public.badge_definitions, public.user_badges from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'techhub_app') then
    grant usage on schema public to techhub_app;
    grant select on table
      public.badge_definitions, public.user_badges to techhub_app;
    grant select, update on table public.team_tasks to techhub_app;
    grant execute on function
      public.thai_academic_year_range(integer),
      public.get_verified_skill_evidence(uuid, timestamptz, timestamptz),
      public.refresh_user_badges(uuid)
    to techhub_app;
  end if;
end $$;

insert into public.badge_definitions (
  code, name_th, description_th, category, icon_name, tier,
  criterion, threshold, sort_order, is_active
) values
  (
    'first_interest', 'เริ่มต้นเส้นทางเทค',
    'แสดงความสนใจรายการแข่งขันด้านเทคโนโลยีรายการแรก',
    'academic', 'Target', 'bronze', 'interest_count', 1, 10, true
  ),
  (
    'interest_explorer', 'นักสำรวจการแข่งขัน',
    'ติดตามข้อมูลการแข่งขันด้านเทคโนโลยีอย่างน้อย 5 รายการ',
    'academic', 'GraduationCap', 'silver', 'interest_count', 5, 20, true
  ),
  (
    'first_confirmed_team', 'ลงสนามกับทีม',
    'เป็นสมาชิกของทีมที่อาจารย์ยืนยันแล้วอย่างน้อย 1 ทีม',
    'collaboration', 'Users', 'bronze', 'confirmed_team_count', 1, 30, true
  ),
  (
    'team_collaborator', 'เพื่อนร่วมทีมตัวจริง',
    'เป็นสมาชิกของทีมที่อาจารย์ยืนยันแล้วอย่างน้อย 3 ทีม',
    'collaboration', 'Users', 'silver', 'confirmed_team_count', 3, 40, true
  ),
  (
    'task_five', 'ส่งงานครบ 5 ชิ้น',
    'ทำงานที่ได้รับมอบหมายในทีมเสร็จอย่างน้อย 5 ชิ้น',
    'collaboration', 'CheckCircle2', 'silver', 'completed_task_count', 5, 50, true
  ),
  (
    'task_ten', 'ขยันต่อเนื่อง 10 ชิ้น',
    'ทำงานที่ได้รับมอบหมายในทีมเสร็จอย่างน้อย 10 ชิ้น',
    'collaboration', 'FolderCheck', 'gold', 'completed_task_count', 10, 60, true
  ),
  (
    'verified_award', 'ผลงานผ่านการรับรอง',
    'มีผลงานแข่งขันที่อาจารย์รับรองผลแล้วอย่างน้อย 1 รางวัล',
    'academic', 'Award', 'silver', 'verified_award_count', 1, 70, true
  ),
  (
    'champion_award', 'รางวัลชนะเลิศของโรงเรียน',
    'มีผลงานที่อาจารย์รับรองว่าได้รางวัลชนะเลิศหรือรางวัลที่ 1',
    'academic', 'Trophy', 'gold', 'champion_award_count', 1, 80, true
  ),
  (
    'skill_evidence_three', 'หลักฐานทักษะ 3 ด้าน',
    'มีหลักฐานทักษะจากการแข่งขันที่เสร็จสิ้นอย่างน้อย 3 ด้าน',
    'academic', 'Award', 'gold', 'verified_skill_count', 3, 90, true
  ),
  (
    'portfolio_ready', 'พร้อมส่งผลงาน',
    'เพิ่มลิงก์ผลงานหรือ GitHub ลงในโปรไฟล์เพื่อให้ทีมพิจารณา',
    'milestone', 'FolderCheck', 'bronze', 'portfolio_link_count', 1, 100, true
  )
on conflict (code) do update
set
  name_th = excluded.name_th,
  description_th = excluded.description_th,
  category = excluded.category,
  icon_name = excluded.icon_name,
  tier = excluded.tier,
  criterion = excluded.criterion,
  threshold = excluded.threshold,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

commit;

