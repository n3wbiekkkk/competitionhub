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

-- ----------------------------------------------------------------------------
-- 6. Grants for Non-Superuser App Role (techhub_app)
-- ----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'techhub_app') then
    grant usage on schema public to techhub_app;
    grant select, insert, update, delete on table
      public.auth_accounts,
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

-- ----------------------------------------------------------------------------
-- Tip: Promote the first teacher account after registering via UI:
-- UPDATE public.profiles SET role = 'teacher' WHERE lower(email) = 'teacher@school.ac.th';
-- ----------------------------------------------------------------------------
