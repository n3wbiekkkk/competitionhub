begin;

drop policy if exists team_tasks_member_all on public.team_tasks;

create policy team_tasks_member_select on public.team_tasks for select
  using (
    public.app_is_system() or public.is_teacher() or
    exists (
      select 1 from public.team_members tm
      join public.teams t on t.id = tm.team_id
      where tm.team_id = team_id and t.status = 'confirmed' and tm.user_id = public.app_uid()
    )
  );

create policy team_tasks_teacher_all on public.team_tasks for all
  using (public.app_is_system() or public.is_teacher())
  with check (public.app_is_system() or public.is_teacher());

commit;
