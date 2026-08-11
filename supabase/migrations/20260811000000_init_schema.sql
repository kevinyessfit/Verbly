-- Verbly — schéma initial
-- Principes : pas de stockage d'image, quota calculé côté serveur uniquement.

-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  locale text default 'fr',
  created_at timestamptz default now()
);

-- SUBSCRIPTIONS (écrite uniquement par le webhook RevenueCat, service_role)
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store text check (store in ('app_store', 'play_store')),
  revenuecat_entitlement text,
  status text not null check (status in ('trialing', 'active', 'expired', 'canceled')),
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint subscriptions_user_id_unique unique (user_id)
);
create index on public.subscriptions (user_id, status);

-- GENERATIONS (log d'usage uniquement, écrite par generate-replies, service_role)
create table public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  style text not null,
  conversation_detected boolean not null,
  suggestion_count int not null default 0,
  created_at timestamptz default now()
);
create index on public.generations (user_id, created_at);
