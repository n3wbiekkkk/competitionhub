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
create policy team_tasks_member_all on public.team_tasks for all
  using (
    public.app_is_system() or public.is_teacher() or
    exists (
      select 1 from public.team_members tm
      join public.teams t on t.id = tm.team_id
      where tm.team_id = team_id and t.status = 'confirmed' and tm.user_id = public.app_uid()
    )
  )
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
