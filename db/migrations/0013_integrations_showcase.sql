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
