begin;

create or replace function public.ensure_notification_preferences()
returns trigger
language plpgsql
as $$
begin
  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists ensure_notification_preferences_trigger on public.auth_accounts;
create trigger ensure_notification_preferences_trigger
  after insert on public.auth_accounts
  for each row execute function public.ensure_notification_preferences();

insert into public.notification_preferences (user_id)
select id from public.auth_accounts
on conflict (user_id) do nothing;

commit;
