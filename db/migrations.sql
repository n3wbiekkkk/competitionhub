-- Incremental, idempotent schema changes for live PostgreSQL.
-- `db/schema.sql` only runs when the Docker volume is first created, so every
-- change after launch must also be applied through this file.
-- Run: docker compose --env-file .env.local exec -T db \
--        psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 < db/migrations.sql

begin;

-- Session invalidation: tokens issued before a password/role change must stop
-- verifying. Tokens carry the version they were minted with.
create table if not exists public.auth_security (
  user_id uuid primary key references public.auth_accounts(id) on delete cascade,
  session_version integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.auth_security enable row level security;
alter table public.auth_security force row level security;

drop policy if exists auth_security_system_all on public.auth_security;
create policy auth_security_system_all
  on public.auth_security
  for all
  using (public.app_is_system())
  with check (public.app_is_system());

-- Returns the caller's session version without exposing the table.
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

revoke all on function public.app_session_version() from public;

-- Team size is a domain invariant, not a UI warning. Drafts stay unconstrained;
-- a confirmed team must always hold min_size..max_size members.
-- Constraint triggers are deferred so one save can insert a team and its
-- members in any order and is checked once, at commit.
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

-- Duplicate detection for the daily scout (normalized source URL).
create index if not exists competitions_source_url_lower_idx
  on public.competitions (lower(source_url))
  where source_url is not null;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'techhub_app') then
    grant select, insert, update, delete on table public.auth_security to techhub_app;
    grant execute on function public.app_session_version() to techhub_app;
  end if;
end $$;

-- Avatar bytes outside profiles, with self/teacher RLS.
create table if not exists public.profile_avatars (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  data bytea not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  updated_at timestamptz not null default now()
);

alter table public.profile_avatars enable row level security;
alter table public.profile_avatars force row level security;

drop policy if exists profile_avatars_select_self on public.profile_avatars;
create policy profile_avatars_select_self
  on public.profile_avatars for select
  using (user_id = public.app_uid() or public.is_teacher() or public.app_is_system());

drop policy if exists profile_avatars_write_self on public.profile_avatars;
create policy profile_avatars_write_self
  on public.profile_avatars for all
  using (user_id = public.app_uid() or public.is_teacher() or public.app_is_system())
  with check (user_id = public.app_uid() or public.is_teacher() or public.app_is_system());

-- Opt-in profile directory. Default false keeps every existing row hidden.
alter table public.profiles
  add column if not exists directory_visible boolean not null default false;

drop function if exists public.query_profile_directory(text, integer, integer);
create or replace function public.query_profile_directory(
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (id uuid, full_name text, nickname text, grade text, skills text[], role text, avatar_url text)
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
      p_query is null or btrim(p_query) = ''
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

drop policy if exists profile_avatars_select_visible on public.profile_avatars;
drop function if exists public.get_directory_profile(uuid);
create or replace function public.get_directory_profile(p_id uuid)
returns table (id uuid, full_name text, nickname text, grade text, skills text[], role text, avatar_url text, bio text,   github_url text,   portfolio_url text,   discord_url text,   line_url text,   contact text )
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
  where p.id = p_id and p.directory_visible;
end;
$$;

revoke all on function public.query_profile_directory(text, integer, integer) from public;
revoke all on function public.get_directory_profile(uuid) from public;

drop policy if exists profile_avatars_select_visible on public.profile_avatars;
create policy profile_avatars_select_visible
  on public.profile_avatars for select
  using (user_id = public.app_uid() or public.is_teacher() or public.app_is_system() or exists (select 1 from public.get_directory_profile(user_id)));

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'techhub_app') then
    grant execute on function public.query_profile_directory(text, integer, integer) to techhub_app;
    grant execute on function public.get_directory_profile(uuid) to techhub_app;
  end if;
end $$;

-- Profile presentation fields for the redesigned profile/settings pages.
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists discord_url text;
alter table public.profiles add column if not exists line_url text;

-- Public forgot-password requests are reviewed by a teacher, who issues a
-- single-use reset link through the admin API. No secret is stored here.
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
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.password_reset_requests
  set status = 'expired'
  where status = 'pending' and expires_at <= now();
end;
$$;

-- Single-use reset tokens. Only the SHA-256 digest is stored.
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
  on public.password_reset_requests
  for all
  using (public.app_is_system())
  with check (public.app_is_system());

drop policy if exists reset_tokens_system_all on public.password_reset_tokens;
create policy reset_tokens_system_all
  on public.password_reset_tokens
  for all
  using (public.app_is_system())
  with check (public.app_is_system());

revoke all on function public.expire_password_reset_requests() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'techhub_app') then
    grant select, insert, update, delete on table
      public.profile_avatars,
      public.password_reset_requests,
      public.password_reset_tokens
    to techhub_app;
    grant execute on function public.expire_password_reset_requests() to techhub_app;
  end if;
end $$;

-- Applied migration ledger.
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
values ('001-phase1-baseline', 'phase1-baseline')
on conflict (version) do nothing;

-- Persistent rate-limit buckets.
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

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'techhub_app') then
    grant select, insert, update, delete on table
      public.rate_limit_buckets, public.schema_migrations
    to techhub_app;
  end if;
end $$;

commit;
