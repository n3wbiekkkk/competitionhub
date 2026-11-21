-- In-app notifications and per-user notification preferences.
-- Both tables are system-only under FORCE RLS. Authenticated request code must
-- authorize in the application layer, then use withSystemDb for these tables.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.auth_accounts(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 40),
  title text not null check (char_length(title) between 1 and 200),
  body text,
  href text check (href is null or (href like '/%' and href not like '//%')),
  competition_id uuid references public.competitions(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_user_dedupe_key unique (user_id, dedupe_key)
);

create index if not exists notifications_user_created_at_idx
  on public.notifications (user_id, created_at desc);

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.auth_accounts(id) on delete cascade,
  deadline_reminders boolean not null default true,
  team_assigned_notices boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.handle_updated_at();

insert into public.notification_preferences (user_id)
select id from public.auth_accounts
on conflict (user_id) do nothing;

alter table public.notifications enable row level security;
alter table public.notifications force row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_preferences force row level security;

do $$
declare
  v_policy record;
begin
  for v_policy in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('notifications', 'notification_preferences')
  loop
    execute format('drop policy %I on public.%I', v_policy.policyname, v_policy.tablename);
  end loop;
end $$;

create policy notifications_system_all
  on public.notifications for all
  using (public.app_is_system()) with check (public.app_is_system());

create policy notification_preferences_system_all
  on public.notification_preferences for all
  using (public.app_is_system()) with check (public.app_is_system());

revoke all on table public.notifications, public.notification_preferences from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'techhub_app') then
    grant usage on schema public to techhub_app;
    grant select, insert, update, delete on table
      public.notifications,
      public.notification_preferences
    to techhub_app;
  end if;
end $$;
