create table if not exists public.user_sessions (
  jti uuid primary key,
  user_id uuid not null references public.auth_accounts(id) on delete cascade,
  user_agent text,
  ip_address text,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists user_sessions_user_active_idx
  on public.user_sessions (user_id)
  where revoked_at is null;

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  template text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','sent','failed')),
  attempts integer not null default 0,
  last_error text,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_outbox_pending_idx
  on public.email_outbox (scheduled_at)
  where status = 'pending';

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);

alter table public.user_sessions enable row level security;
alter table public.user_sessions force row level security;
alter table public.email_outbox enable row level security;
alter table public.email_outbox force row level security;
alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;

drop policy if exists user_sessions_system_all on public.user_sessions;
create policy user_sessions_system_all
  on public.user_sessions for all
  using (public.app_is_system()) with check (public.app_is_system());

drop policy if exists email_outbox_system_all on public.email_outbox;
create policy email_outbox_system_all
  on public.email_outbox for all
  using (public.app_is_system()) with check (public.app_is_system());

drop policy if exists audit_logs_system_read on public.audit_logs;
create policy audit_logs_system_read
  on public.audit_logs for select
  using (public.app_is_system());

drop policy if exists audit_logs_system_insert on public.audit_logs;
create policy audit_logs_system_insert
  on public.audit_logs for insert
  with check (public.app_is_system());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'techhub_app') then
    grant select, insert, update, delete on table public.user_sessions, public.email_outbox to techhub_app;
    grant select, insert on table public.audit_logs to techhub_app;
  end if;
end $$;
