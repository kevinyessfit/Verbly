-- Passage des abonnements auto-renouvelés (RevenueCat / IAP) aux pass prépayés
-- payés en mobile money. Le mobile money ne fait pas de prélèvement récurrent :
-- l'utilisateur achète une durée d'accès et repaie s'il veut prolonger.
--
-- get_remaining_quota est inchangée : elle teste déjà
-- `status = 'active' and current_period_end > now()`, ce qui décrit exactement
-- un pass qui expire tout seul.

-- SUBSCRIPTIONS : les opérateurs remplacent les stores, le pass remplace
-- l'entitlement RevenueCat.
alter table public.subscriptions drop constraint subscriptions_store_check;
alter table public.subscriptions
  add constraint subscriptions_store_check
  check (store in ('mtn', 'moov', 'celtiis', 'other'));

alter table public.subscriptions rename column revenuecat_entitlement to pass_type;
alter table public.subscriptions
  add constraint subscriptions_pass_type_check
  check (pass_type in ('day', 'week', 'month'));

-- PAYMENTS : une ligne par tentative de paiement.
-- La contrainte d'unicité sur (provider, provider_ref) est ce qui rend le
-- webhook idempotent : un rejeu de l'agrégateur ne peut pas créditer deux fois.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  provider_ref text not null,
  pass_type text not null check (pass_type in ('day', 'week', 'month')),
  amount_xof int not null check (amount_xof > 0),
  status text not null check (status in ('pending', 'succeeded', 'failed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint payments_provider_ref_unique unique (provider, provider_ref)
);
create index on public.payments (user_id, created_at);

alter table public.payments enable row level security;

create policy "payments: user lit ses propres paiements"
  on public.payments for select using (auth.uid() = user_id);

-- Crédite une durée d'accès. Cumulatif : acheter un pass alors qu'on en a un
-- en cours prolonge la date de fin au lieu de l'écraser.
create or replace function public.grant_pass(
  p_user_id uuid,
  p_pass_type text,
  p_store text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_interval interval;
  v_end timestamptz;
begin
  v_interval := case p_pass_type
    when 'day' then interval '1 day'
    when 'week' then interval '7 days'
    when 'month' then interval '30 days'
  end;
  if v_interval is null then
    raise exception 'unknown pass type %', p_pass_type;
  end if;

  insert into public.subscriptions (user_id, store, pass_type, status, current_period_end, updated_at)
  values (p_user_id, p_store, p_pass_type, 'active', now() + v_interval, now())
  on conflict (user_id) do update
    set status = 'active',
        store = coalesce(excluded.store, subscriptions.store),
        pass_type = excluded.pass_type,
        current_period_end =
          greatest(coalesce(subscriptions.current_period_end, now()), now()) + v_interval,
        updated_at = now()
  returning current_period_end into v_end;

  return v_end;
end;
$$;

revoke execute on function public.grant_pass(uuid, text, text) from public, anon, authenticated;
