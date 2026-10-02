begin;

create or replace function public.list_referral_inbox(
  p_page integer default 1,
  p_limit integer default 10,
  p_search text default '',
  p_area_id uuid default null
)
returns table (
  id uuid, attention_id uuid, rac_code text, client_dni text, client_name text,
  destination_area_id uuid, destination_area_name text, referred_by_name text,
  referred_at timestamptz, total_count bigint
)
language plpgsql security definer stable set search_path = public
as $$
declare v_is_admin boolean := public.is_admin(); v_user_area uuid;
begin
  if auth.uid() is null or public.is_active_tablet_session() then
    raise exception 'No tienes permiso para consultar el buzón.';
  end if;

  select p.area_id into v_user_area
  from public.profiles p
  where p.id = auth.uid()
    and p.status = 'active';

  if not v_is_admin and v_user_area is null then return; end if;

  return query
  select ar.id, ca.id, ca.rac_code, c.dni,
    concat_ws(' ', c.first_name, nullif(c.middle_name, ''), c.paternal_surname, c.maternal_surname),
    ar.destination_area_id, ar.destination_area_name, ar.referred_by_name, ar.referred_at,
    count(*) over()
  from public.attention_referrals ar
  join public.customer_attentions ca on ca.id = ar.attention_id and ca.status = 'ACTIVE'
  join public.clients c on c.id = ca.client_id
  where ar.status = 'PENDING'
    and (v_is_admin or ar.destination_area_id = v_user_area)
    and (not v_is_admin or p_area_id is null or ar.destination_area_id = p_area_id)
    and (coalesce(btrim(p_search), '') = ''
      or ca.rac_code ilike '%' || btrim(p_search) || '%'
      or (regexp_replace(p_search, '[^0-9]', '', 'g') <> ''
        and c.dni ilike '%' || regexp_replace(p_search, '[^0-9]', '', 'g') || '%'))
  order by ar.referred_at
  limit greatest(1, least(coalesce(p_limit, 10), 100))
  offset (greatest(coalesce(p_page, 1), 1) - 1) * greatest(1, least(coalesce(p_limit, 10), 100));
end;
$$;

notify pgrst, 'reload schema';

commit;
