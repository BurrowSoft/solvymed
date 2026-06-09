-- Auto-create a professionals row whenever a new auth user is created.
-- The trigger fires on signup; the INSERT below backfills any users who
-- signed up before this migration was applied.

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.professionals (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Backfill: create professionals rows for users who already exist
insert into public.professionals (id, email, full_name)
select
  id,
  email,
  coalesce(
    raw_user_meta_data->>'full_name',
    split_part(email, '@', 1)
  )
from auth.users
on conflict (id) do nothing;
