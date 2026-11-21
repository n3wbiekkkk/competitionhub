create extension if not exists pg_trgm;

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
