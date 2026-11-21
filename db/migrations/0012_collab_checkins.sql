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
