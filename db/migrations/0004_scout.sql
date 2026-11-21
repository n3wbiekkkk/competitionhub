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
