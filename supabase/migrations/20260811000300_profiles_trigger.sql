-- Création automatique du row `profiles` à l'inscription.
-- Nécessaire : subscriptions.user_id et generations.user_id référencent
-- profiles(id), pas auth.users(id). Sans ce trigger, le premier insert dans
-- generations viole la FK.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Rattrapage pour les comptes déjà créés avant ce trigger (no-op sur une base neuve).
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;
