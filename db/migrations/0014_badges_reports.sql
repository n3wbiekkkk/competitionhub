begin;

-- Phase 13: verified badges, skill evidence and Thai academic-year reports.
-- Badge awards are derived from existing activity rows; students never write
-- badges directly. Both tables use FORCE ROW LEVEL SECURITY.

create table if not exists public.badge_definitions (
  code text primary key check (btrim(code) <> ''),
  name_th text not null check (btrim(name_th) <> ''),
  description_th text not null check (btrim(description_th) <> ''),
  category text not null check (category in ('academic', 'collaboration', 'milestone')),
  icon_name text not null check (
    icon_name in (
      'Award', 'Users', 'Target', 'CheckCircle2',
      'GraduationCap', 'Trophy', 'FolderCheck'
    )
  ),
  tier text not null check (tier in ('bronze', 'silver', 'gold')),
  criterion text not null check (
    criterion in (
      'interest_count', 'confirmed_team_count', 'completed_task_count',
      'verified_award_count', 'champion_award_count', 'verified_skill_count',
      'portfolio_link_count'
    )
  ),
  threshold integer not null default 1 check (threshold >= 1),
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table if not exists public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_code text not null references public.badge_definitions(code) on delete cascade,
  evidence_count integer not null default 1 check (evidence_count >= 0),
  awarded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, badge_code)
);

create index if not exists user_badges_awarded_at_idx
  on public.user_badges (awarded_at desc);

-- Team tasks gain an explicit completion timestamp so a completed-task badge
-- and the academic-year report count real completion, not a due date.
alter table public.team_tasks add column if not exists completed_at timestamptz;

create or replace function public.set_team_task_completion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'done' then
    new.completed_at = coalesce(new.completed_at, now());
  else
    new.completed_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists set_team_task_completion_trigger on public.team_tasks;
create trigger set_team_task_completion_trigger
  before insert or update of status on public.team_tasks
  for each row execute function public.set_team_task_completion();

-- Thai school academic year: 1 May BE YYYY through 30 April BE YYYY+1.
create or replace function public.thai_academic_year_range(p_be_year integer)
returns table (start_at timestamptz, end_at timestamptz, label_th text)
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_be_year is null or p_be_year < 2500 or p_be_year > 2600 then
    raise exception 'ปีการศึกษาไม่ถูกต้อง';
  end if;

  return query
  select
    (make_date(p_be_year - 543, 5, 1)::timestamp at time zone 'Asia/Bangkok'),
    ((make_date(p_be_year - 542, 4, 30) + 1)::timestamp at time zone 'Asia/Bangkok')
      - interval '1 microsecond',
    'ปีการศึกษา ' || p_be_year::text;
end;
$$;

-- Verified evidence is a closed competition with a teacher-verified result,
-- counted once per competition and per skill from team roles and tech hints.
create or replace function public.get_verified_skill_evidence(
  p_user_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  skill text,
  evidence_count integer,
  role_labels text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (
    public.app_is_system()
    or p_user_id = public.app_uid()
    or public.is_teacher()
    or public.can_view_profile(p_user_id)
    or exists (
      select 1 from public.profiles p
      where p.id = p_user_id and p.directory_visible
    )
  ) then
    return;
  end if;

  return query
  with verified_results as (
    select distinct
      cr.id as result_id,
      cr.competition_id,
      cr.team_id,
      c.tech_stack_hints
    from public.competition_results cr
    join public.competitions c on c.id = cr.competition_id and c.status = 'closed'
    join public.teams t on t.id = cr.team_id and t.status = 'confirmed'
    where cr.verified_by is not null
      and (p_from is null or cr.created_at >= p_from)
      and (p_to is null or cr.created_at <= p_to)
  ),
  evidence_items as (
    select
      tm.user_id,
      vr.competition_id,
      lower(btrim(tm.assigned_role)) as skill,
      tm.assigned_role as role_label
    from verified_results vr
    join public.team_members tm on tm.team_id = vr.team_id

    union all

    select
      tm.user_id,
      vr.competition_id,
      lower(btrim(hint)) as skill,
      tm.assigned_role as role_label
    from verified_results vr
    join public.team_members tm on tm.team_id = vr.team_id
    cross join lateral unnest(vr.tech_stack_hints) as hint
  )
  select
    ei.skill,
    count(distinct ei.competition_id)::integer as evidence_count,
    coalesce(
      array_agg(distinct ei.role_label) filter (where btrim(ei.role_label) <> ''),
      array[]::text[]
    ) as role_labels
  from evidence_items ei
  where ei.user_id = p_user_id and btrim(ei.skill) <> ''
  group by ei.skill
  order by count(distinct ei.competition_id) desc, ei.skill asc;
end;
$$;

-- Recomputes all automatic badge rows for one profile. The previous
-- system_mode value is restored in every path so a user transaction is never
-- left privileged.
create or replace function public.refresh_user_badges(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_mode text := current_setting('app.system_mode', true);
  v_interests integer := 0;
  v_teams integer := 0;
  v_tasks integer := 0;
  v_awards integer := 0;
  v_champions integer := 0;
  v_skills integer := 0;
  v_portfolio integer := 0;
begin
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    return;
  end if;

  perform set_config('app.system_mode', 'on', true);

  select count(*)::integer into v_interests
  from public.interests i
  where i.user_id = p_user_id;

  select count(distinct t.id)::integer into v_teams
  from public.team_members tm
  join public.teams t on t.id = tm.team_id
  where tm.user_id = p_user_id and t.status = 'confirmed';

  select count(*)::integer into v_tasks
  from public.team_tasks tt
  where tt.assignee_id = p_user_id and tt.status = 'done';

  select count(distinct cr.id)::integer into v_awards
  from public.competition_results cr
  join public.teams t on t.id = cr.team_id
  join public.team_members tm on tm.team_id = t.id
  where tm.user_id = p_user_id and cr.verified_by is not null;

  select count(distinct cr.id)::integer into v_champions
  from public.competition_results cr
  join public.teams t on t.id = cr.team_id
  join public.team_members tm on tm.team_id = t.id
  where tm.user_id = p_user_id
    and cr.verified_by is not null
    and (
      lower(btrim(coalesce(cr.rank_tier, ''))) in (
        '1', '1st', 'first', 'first place', 'winner', 'champion', 'gold',
        'ชนะเลิศ', 'รางวัลที่ 1'
      )
      or lower(btrim(coalesce(cr.award_title, ''))) like '%ชนะเลิศ%'
    );

  select count(*)::integer into v_skills
  from public.get_verified_skill_evidence(p_user_id);

  select case
    when nullif(btrim(coalesce(p.github_url, '')), '') is not null
      or nullif(btrim(coalesce(p.portfolio_url, '')), '') is not null
    then 1 else 0
  end into v_portfolio
  from public.profiles p
  where p.id = p_user_id;

  insert into public.user_badges (user_id, badge_code, evidence_count)
  select p_user_id, candidate.code, candidate.count
  from (
    values
      ('first_interest', v_interests),
      ('interest_explorer', v_interests),
      ('first_confirmed_team', v_teams),
      ('team_collaborator', v_teams),
      ('task_five', v_tasks),
      ('task_ten', v_tasks),
      ('verified_award', v_awards),
      ('champion_award', v_champions),
      ('skill_evidence_three', v_skills),
      ('portfolio_ready', v_portfolio)
  ) as candidate(code, count)
  join public.badge_definitions d on d.code = candidate.code
  where d.is_active and candidate.count >= d.threshold
  on conflict (user_id, badge_code) do update
  set evidence_count = excluded.evidence_count, updated_at = now();

  perform set_config(
    'app.system_mode',
    coalesce(v_previous_mode, 'off'),
    true
  );
exception when others then
  perform set_config(
    'app.system_mode',
    coalesce(v_previous_mode, 'off'),
    true
  );
  raise;
end;
$$;

create or replace function public.refresh_badges_after_interest()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.refresh_user_badges(new.user_id);
  return new;
end;
$$;

drop trigger if exists refresh_badges_after_interest_trigger on public.interests;
create trigger refresh_badges_after_interest_trigger
  after insert on public.interests
  for each row execute function public.refresh_badges_after_interest();

create or replace function public.refresh_badges_after_team_member()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
begin
  perform public.refresh_user_badges(v_user_id);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_badges_after_team_member_trigger on public.team_members;
create trigger refresh_badges_after_team_member_trigger
  after insert or update of assigned_role on public.team_members
  for each row execute function public.refresh_badges_after_team_member();

create or replace function public.refresh_badges_after_team_status()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    for v_user_id in
      select tm.user_id from public.team_members tm where tm.team_id = new.id
    loop
      perform public.refresh_user_badges(v_user_id);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_badges_after_team_status_trigger on public.teams;
create trigger refresh_badges_after_team_status_trigger
  after update of status on public.teams
  for each row execute function public.refresh_badges_after_team_status();

create or replace function public.refresh_badges_after_result()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if new.verified_by is not null and new.team_id is not null then
    for v_user_id in
      select tm.user_id from public.team_members tm where tm.team_id = new.team_id
    loop
      perform public.refresh_user_badges(v_user_id);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_badges_after_result_trigger on public.competition_results;
create trigger refresh_badges_after_result_trigger
  after insert or update of verified_by, team_id on public.competition_results
  for each row execute function public.refresh_badges_after_result();

create or replace function public.refresh_badges_after_task()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_previous_status text;
begin
  if tg_op = 'INSERT' then
    v_previous_status := null;
  else
    v_previous_status := old.status;
  end if;

  if new.status = 'done'
    and v_previous_status is distinct from 'done'
    and new.assignee_id is not null then
    perform public.refresh_user_badges(new.assignee_id);
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_badges_after_task_trigger on public.team_tasks;
create trigger refresh_badges_after_task_trigger
  after insert or update of status, assignee_id on public.team_tasks
  for each row execute function public.refresh_badges_after_task();

create or replace function public.refresh_badges_after_competition_close()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    for v_user_id in
      select distinct tm.user_id
      from public.teams t
      join public.team_members tm on tm.team_id = t.id
      where t.competition_id = new.id and t.status = 'confirmed'
    loop
      perform public.refresh_user_badges(v_user_id);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_badges_after_competition_close_trigger on public.competitions;
create trigger refresh_badges_after_competition_close_trigger
  after update of status on public.competitions
  for each row execute function public.refresh_badges_after_competition_close();

create or replace function public.refresh_badges_after_profile_links()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.refresh_user_badges(new.id);
  return new;
end;
$$;

drop trigger if exists refresh_badges_after_profile_links_trigger on public.profiles;
create trigger refresh_badges_after_profile_links_trigger
  after update of github_url, portfolio_url on public.profiles
  for each row execute function public.refresh_badges_after_profile_links();

alter table public.badge_definitions enable row level security;
alter table public.badge_definitions force row level security;
alter table public.user_badges enable row level security;
alter table public.user_badges force row level security;

drop policy if exists badge_definitions_select_all on public.badge_definitions;
create policy badge_definitions_select_all
  on public.badge_definitions for select
  using (true);

drop policy if exists user_badges_select_visible on public.user_badges;
create policy user_badges_select_visible
  on public.user_badges for select
  using (
    public.app_is_system()
    or user_id = public.app_uid()
    or public.can_view_profile(user_id)
    or exists (
      select 1 from public.profiles p
      where p.id = user_id and p.directory_visible
    )
  );

drop policy if exists user_badges_system_write on public.user_badges;
create policy user_badges_system_write
  on public.user_badges for all
  using (public.app_is_system())
  with check (public.app_is_system());

revoke all on table public.badge_definitions, public.user_badges from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'techhub_app') then
    grant usage on schema public to techhub_app;
    grant select on table
      public.badge_definitions, public.user_badges to techhub_app;
    grant select, update on table public.team_tasks to techhub_app;
    grant execute on function
      public.thai_academic_year_range(integer),
      public.get_verified_skill_evidence(uuid, timestamptz, timestamptz),
      public.refresh_user_badges(uuid)
    to techhub_app;
  end if;
end $$;

insert into public.badge_definitions (
  code, name_th, description_th, category, icon_name, tier,
  criterion, threshold, sort_order, is_active
) values
  (
    'first_interest', 'เริ่มต้นเส้นทางเทค',
    'แสดงความสนใจรายการแข่งขันด้านเทคโนโลยีรายการแรก',
    'academic', 'Target', 'bronze', 'interest_count', 1, 10, true
  ),
  (
    'interest_explorer', 'นักสำรวจการแข่งขัน',
    'ติดตามข้อมูลการแข่งขันด้านเทคโนโลยีอย่างน้อย 5 รายการ',
    'academic', 'GraduationCap', 'silver', 'interest_count', 5, 20, true
  ),
  (
    'first_confirmed_team', 'ลงสนามกับทีม',
    'เป็นสมาชิกของทีมที่อาจารย์ยืนยันแล้วอย่างน้อย 1 ทีม',
    'collaboration', 'Users', 'bronze', 'confirmed_team_count', 1, 30, true
  ),
  (
    'team_collaborator', 'เพื่อนร่วมทีมตัวจริง',
    'เป็นสมาชิกของทีมที่อาจารย์ยืนยันแล้วอย่างน้อย 3 ทีม',
    'collaboration', 'Users', 'silver', 'confirmed_team_count', 3, 40, true
  ),
  (
    'task_five', 'ส่งงานครบ 5 ชิ้น',
    'ทำงานที่ได้รับมอบหมายในทีมเสร็จอย่างน้อย 5 ชิ้น',
    'collaboration', 'CheckCircle2', 'silver', 'completed_task_count', 5, 50, true
  ),
  (
    'task_ten', 'ขยันต่อเนื่อง 10 ชิ้น',
    'ทำงานที่ได้รับมอบหมายในทีมเสร็จอย่างน้อย 10 ชิ้น',
    'collaboration', 'FolderCheck', 'gold', 'completed_task_count', 10, 60, true
  ),
  (
    'verified_award', 'ผลงานผ่านการรับรอง',
    'มีผลงานแข่งขันที่อาจารย์รับรองผลแล้วอย่างน้อย 1 รางวัล',
    'academic', 'Award', 'silver', 'verified_award_count', 1, 70, true
  ),
  (
    'champion_award', 'รางวัลชนะเลิศของโรงเรียน',
    'มีผลงานที่อาจารย์รับรองว่าได้รางวัลชนะเลิศหรือรางวัลที่ 1',
    'academic', 'Trophy', 'gold', 'champion_award_count', 1, 80, true
  ),
  (
    'skill_evidence_three', 'หลักฐานทักษะ 3 ด้าน',
    'มีหลักฐานทักษะจากการแข่งขันที่เสร็จสิ้นอย่างน้อย 3 ด้าน',
    'academic', 'Award', 'gold', 'verified_skill_count', 3, 90, true
  ),
  (
    'portfolio_ready', 'พร้อมส่งผลงาน',
    'เพิ่มลิงก์ผลงานหรือ GitHub ลงในโปรไฟล์เพื่อให้ทีมพิจารณา',
    'milestone', 'FolderCheck', 'bronze', 'portfolio_link_count', 1, 100, true
  )
on conflict (code) do update
set
  name_th = excluded.name_th,
  description_th = excluded.description_th,
  category = excluded.category,
  icon_name = excluded.icon_name,
  tier = excluded.tier,
  criterion = excluded.criterion,
  threshold = excluded.threshold,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

commit;
