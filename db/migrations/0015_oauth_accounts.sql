-- Phase 14: OAuth account links for Google and GitHub sign-in.
-- A user may link several providers; each (provider, external id) pair is
-- unique. OAuth-only accounts have no local password. The table uses FORCE RLS
-- and is reachable only in system mode (auth flows run under withSystemDb).

begin;

create table if not exists public.oauth_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.auth_accounts(id) on delete cascade,
  provider text not null check (provider in ('google', 'github')),
  provider_account_id text not null,
  email text,
  created_at timestamptz not null default now()
);

create unique index if not exists oauth_accounts_provider_account_key
  on public.oauth_accounts (provider, provider_account_id);

alter table public.oauth_accounts enable row level security;
alter table public.oauth_accounts force row level security;

drop policy if exists oauth_accounts_system_all on public.oauth_accounts;
create policy oauth_accounts_system_all on public.oauth_accounts for all
  using (public.app_is_system())
  with check (public.app_is_system());

revoke all on table public.oauth_accounts from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'techhub_app') then
    grant usage on schema public to techhub_app;
    grant select, insert, update, delete on table public.oauth_accounts to techhub_app;
  end if;
end $$;

-- OAuth-only accounts have no local password. Safe to rerun.
alter table public.auth_accounts alter column password_hash drop not null;

commit;
