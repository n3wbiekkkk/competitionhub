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
    grant select, insert, update on table public.auth_security to techhub_app;
    grant execute on function public.app_session_version() to techhub_app;
  end if;
end $$;

-- Opt-in profile directory. Default false keeps every existing row hidden.
alter table public.profiles
  add column if not exists directory_visible boolean not null default false;

create or replace function public.query_profile_directory(
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (id uuid, full_name text, nickname text, grade text, skills text[])
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
  select p.id, p.full_name, p.nickname, p.grade, p.skills
  from public.profiles p
  where p.directory_visible
    and p.role = 'student'
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

create or replace function public.get_directory_profile(p_id uuid)
returns table (id uuid, full_name text, nickname text, grade text, skills text[])
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
  select p.id, p.full_name, p.nickname, p.grade, p.skills
  from public.profiles p
  where p.id = p_id and p.directory_visible and p.role = 'student';
end;
$$;

revoke all on function public.query_profile_directory(text, integer, integer) from public;
revoke all on function public.get_directory_profile(uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'techhub_app') then
    grant execute on function public.query_profile_directory(text, integer, integer) to techhub_app;
    grant execute on function public.get_directory_profile(uuid) to techhub_app;
  end if;
end $$;

commit;
