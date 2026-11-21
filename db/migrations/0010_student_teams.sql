-- Phase 9: student-led team formation and recruitment.
-- The migration runner already wraps this file in one transaction.

alter table public.competitions add column if not exists team_formation_mode text not null default 'hybrid'
  check (team_formation_mode in ('teacher_managed', 'student_self_form', 'hybrid'));

alter table public.teams add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.teams add column if not exists formation_source text not null default 'teacher'
  check (formation_source in ('teacher', 'student'));
alter table public.teams add column if not exists teacher_approved boolean not null default false;
alter table public.teams add column if not exists recruitment_locked boolean not null default false;

create index if not exists teams_student_formation_idx
  on public.teams (competition_id, formation_source, status);

create table if not exists public.team_open_roles (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  role text not null check (btrim(role) <> ''),
  slots integer not null default 1 check (slots between 1 and 10),
  status text not null default 'open' check (status in ('open', 'paused', 'closed')),
  note text check (note is null or char_length(note) <= 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, role)
);

create index if not exists team_open_roles_team_status_idx
  on public.team_open_roles (team_id, status);

create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  direction text not null check (direction in ('team_invite', 'join_request')),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  open_role_id uuid references public.team_open_roles(id) on delete set null,
  role text not null check (btrim(role) <> ''),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint team_invitations_distinct_parties check (sender_id <> recipient_id)
);

create index if not exists team_invitations_team_status_idx
  on public.team_invitations (team_id, status);

create index if not exists team_invitations_recipient_status_idx
  on public.team_invitations (recipient_id, status);

create unique index if not exists team_invitations_pending_pair_idx
  on public.team_invitations (team_id, direction, sender_id, recipient_id, role)
  where status = 'pending';

drop trigger if exists set_team_open_roles_updated_at on public.team_open_roles;
create trigger set_team_open_roles_updated_at
  before update on public.team_open_roles
  for each row execute function public.handle_updated_at();

create or replace function public.is_directory_visible_student(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_user_id is not null
    and p_user_id <> public.app_uid()
    and exists (
      select 1 from public.profiles p
      where p.id = p_user_id
        and p.role = 'student'
        and p.directory_visible
    );
$$;

create or replace function public.is_student_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.app_is_system()
    or public.is_teacher()
    or exists (
      select 1
      from public.teams t
      join public.team_members tm on tm.team_id = t.id
      where t.id = p_team_id
        and t.formation_source = 'student'
        and tm.user_id = public.app_uid()
    );
$$;

create or replace function public.is_student_team_owner(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.app_is_system()
    or public.is_teacher()
    or exists (
      select 1
      from public.teams t
      where t.id = p_team_id
        and t.formation_source = 'student'
        and t.created_by = public.app_uid()
    );
$$;

create or replace function public.student_team_recruitment_open(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.app_uid() is not null
    and exists (
      select 1
      from public.teams t
      join public.competitions c on c.id = t.competition_id
      where t.id = p_team_id
        and t.formation_source = 'student'
        and t.status = 'draft'
        and not t.recruitment_locked
        and c.status = 'open'
        and c.team_formation_mode in ('student', 'hybrid')
        and (c.deadline is null or c.deadline >= current_date)
    );
$$;

create or replace function public.student_team_member_count(
  p_team_id uuid,
  p_user_id uuid default null
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.team_members tm
  where tm.team_id = p_team_id
    and (p_user_id is null or tm.user_id = p_user_id);
$$;

create or replace function public.student_team_open_role_taken(p_role_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.team_open_roles r
  join public.team_members tm
    on tm.team_id = r.team_id
   and lower(btrim(tm.assigned_role)) = lower(btrim(r.role))
  where r.id = p_role_id;
$$;

create or replace function public.can_join_student_team(p_team_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_user_id is not null
    and (
      (
        p_user_id = public.app_uid()
        and public.is_student_team_owner(p_team_id)
      )
      or exists (
        select 1
        from public.team_invitations i
        where i.team_id = p_team_id
          and i.status = 'pending'
          and (
            (
              i.direction = 'team_invite'
              and i.recipient_id = p_user_id
              and public.app_uid() = p_user_id
            )
            or (
              i.direction = 'join_request'
              and i.sender_id = p_user_id
              and public.is_student_team_owner(p_team_id)
            )
          )
      )
    );
$$;

create or replace function public.query_student_team_candidates(
  p_competition_id uuid,
  p_exclude_user_id uuid default null
)
returns table (
  id uuid,
  full_name text,
  nickname text,
  grade text,
  skills text[],
  preferred_role text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.nickname, p.grade, p.skills, i.preferred_role
  from public.profiles p
  join public.interests i on i.user_id = p.id
  where public.app_uid() is not null
    and not public.app_is_system()
    and p.directory_visible
    and p.role = 'student'
    and i.competition_id = p_competition_id
    and (p_exclude_user_id is null or p.id <> p_exclude_user_id)
  order by p.full_name asc, p.id asc
  limit 50;
$$;

revoke all on function public.is_directory_visible_student(uuid) from public;
revoke all on function public.is_student_team_member(uuid) from public;
revoke all on function public.is_student_team_owner(uuid) from public;
revoke all on function public.student_team_recruitment_open(uuid) from public;
revoke all on function public.student_team_member_count(uuid, uuid) from public;
revoke all on function public.student_team_open_role_taken(uuid) from public;
revoke all on function public.can_join_student_team(uuid, uuid) from public;
revoke all on function public.query_student_team_candidates(uuid, uuid) from public;

alter table public.team_open_roles enable row level security;
alter table public.team_open_roles force row level security;
alter table public.team_invitations enable row level security;
alter table public.team_invitations force row level security;

drop policy if exists team_open_roles_select on public.team_open_roles;
create policy team_open_roles_select
  on public.team_open_roles for select
  using (
    public.app_is_system()
    or public.is_teacher()
    or public.is_student_team_member(team_id)
    or (
      status = 'open'
      and public.student_team_recruitment_open(team_id)
    )
  );

drop policy if exists team_open_roles_member_write on public.team_open_roles;
create policy team_open_roles_member_write
  on public.team_open_roles for all
  using (
    public.app_is_system()
    or public.is_student_team_owner(team_id)
  )
  with check (
    public.app_is_system()
    or (
      public.is_student_team_owner(team_id)
      and public.student_team_recruitment_open(team_id)
    )
  );

drop policy if exists team_invitations_select on public.team_invitations;
create policy team_invitations_select
  on public.team_invitations for select
  using (
    public.app_is_system()
    or public.is_teacher()
    or sender_id = public.app_uid()
    or recipient_id = public.app_uid()
  );

drop policy if exists team_invitations_insert on public.team_invitations;
create policy team_invitations_insert
  on public.team_invitations for insert
  with check (
    public.app_uid() is not null
    and sender_id = public.app_uid()
    and public.student_team_recruitment_open(team_id)
    and (select p.role from public.profiles p where p.id = public.app_uid()) = 'student'
    and (
      (
        direction = 'team_invite'
        and public.is_student_team_owner(team_id)
        and public.is_directory_visible_student(recipient_id)
      )
      or (
        direction = 'join_request'
        and recipient_id = (select t.created_by from public.teams t where t.id = team_id)
      )
    )
  );

drop policy if exists team_invitations_recipient_update on public.team_invitations;
create policy team_invitations_recipient_update
  on public.team_invitations for update
  using (recipient_id = public.app_uid() and status = 'pending')
  with check (recipient_id = public.app_uid() and status in ('accepted', 'declined'));

drop policy if exists team_invitations_sender_update on public.team_invitations;
create policy team_invitations_sender_update
  on public.team_invitations for update
  using (sender_id = public.app_uid() and status = 'pending')
  with check (sender_id = public.app_uid() and status = 'revoked');

drop policy if exists team_invitations_teacher_all on public.team_invitations;
create policy team_invitations_teacher_all
  on public.team_invitations for all
  using (public.app_is_system() or public.is_teacher())
  with check (public.app_is_system() or public.is_teacher());

drop policy if exists teams_insert_student_draft on public.teams;
create policy teams_insert_student_draft
  on public.teams for insert
  with check (
    formation_source = 'student'
    and status = 'draft'
    and created_by = public.app_uid()
    and not teacher_approved
    and not recruitment_locked
    and exists (
      select 1 from public.competitions c
      where c.id = competition_id
        and c.status = 'open'
        and c.team_formation_mode in ('student', 'hybrid')
    )
  );

drop policy if exists teams_select_student_draft on public.teams;
create policy teams_select_student_draft
  on public.teams for select
  using (
    formation_source = 'student'
    and status = 'draft'
    and public.is_student_team_member(id)
  );

drop policy if exists teams_select_student_invited on public.teams;
create policy teams_select_student_invited
  on public.teams for select
  using (
    formation_source = 'student'
    and status = 'draft'
    and exists (
      select 1 from public.team_invitations i
      where i.team_id = id
        and i.status in ('pending', 'accepted')
        and (i.sender_id = public.app_uid() or i.recipient_id = public.app_uid())
    )
  );

drop policy if exists team_members_select_student_draft on public.team_members;
create policy team_members_select_student_draft
  on public.team_members for select
  using (
    public.is_student_team_member(team_id)
  );

drop policy if exists team_members_insert_student_draft on public.team_members;
create policy team_members_insert_student_draft
  on public.team_members for insert
  with check (
    public.student_team_recruitment_open(team_id)
    and public.can_join_student_team(team_id, user_id)
  );

drop policy if exists team_members_delete_student_draft on public.team_members;
create policy team_members_delete_student_draft
  on public.team_members for delete
  using (
    user_id = public.app_uid()
    and exists (
      select 1 from public.teams t
      where t.id = team_id
        and t.formation_source = 'student'
        and t.status = 'draft'
        and not t.recruitment_locked
    )
  );

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'techhub_app') then
    grant select, insert, update, delete on table
      public.team_open_roles,
      public.team_invitations
    to techhub_app;

    grant execute on function
      public.is_directory_visible_student(uuid),
      public.is_student_team_member(uuid),
      public.is_student_team_owner(uuid),
      public.student_team_recruitment_open(uuid),
      public.student_team_member_count(uuid, uuid),
      public.student_team_open_role_taken(uuid),
      public.can_join_student_team(uuid, uuid),
      public.query_student_team_candidates(uuid, uuid)
    to techhub_app;
  end if;
end $$;
