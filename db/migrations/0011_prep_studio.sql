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
