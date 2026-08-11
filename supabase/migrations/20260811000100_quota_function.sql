-- QUOTA : essai gratuit unique de 3 générations, non renouvelable.

create or replace function public.get_remaining_quota(p_user_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_subscribed boolean;
  v_used_total int;
  v_free_trial constant int := 3;
begin
  select exists (
    select 1 from public.subscriptions
    where user_id = p_user_id
      and status = 'active'
      and current_period_end > now()
  ) into v_is_subscribed;

  if v_is_subscribed then
    return 999;
  end if;

  select count(*) into v_used_total
  from public.generations
  where user_id = p_user_id;

  return greatest(v_free_trial - v_used_total, 0);
end;
$$;

-- La fonction prend un user_id en paramètre : sans ce revoke, n'importe quel
-- utilisateur authentifié pourrait lire le quota d'un autre. Seul le
-- service_role (Edge Function generate-replies) doit pouvoir l'appeler.
revoke execute on function public.get_remaining_quota(uuid) from public, anon, authenticated;
