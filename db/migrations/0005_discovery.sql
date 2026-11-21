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
