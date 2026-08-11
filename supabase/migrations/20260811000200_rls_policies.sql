-- RLS : lecture seule côté client, toute écriture passe par service_role
-- (service_role bypasse RLS, donc aucune policy insert/update n'est nécessaire).

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.generations enable row level security;

create policy "profiles: user lit son propre profil"
  on public.profiles for select using (auth.uid() = id);

create policy "subscriptions: user lit son propre abonnement"
  on public.subscriptions for select using (auth.uid() = user_id);

create policy "generations: user lit son propre historique"
  on public.generations for select using (auth.uid() = user_id);
