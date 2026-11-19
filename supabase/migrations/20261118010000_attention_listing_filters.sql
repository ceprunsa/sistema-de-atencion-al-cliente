-- Filtros por medio y mesa para el listado de atenciones.
-- Ejecutar despues de 13_admission_processes.sql y 04_workstations_surveys_referral_inbox.sql.

begin;

create index if not exists customer_attentions_created_by_created_at_idx
  on public.customer_attentions (created_by, created_at desc);
create index if not exists customer_attentions_channel_created_at_idx
  on public.customer_attentions (service_channel_id, created_at desc);
create index if not exists attention_surveys_workstation_attention_idx
  on public.attention_surveys (workstation_id, attention_id);

create or replace function public.list_attention_filter_options()
returns table (option_type text, id uuid, name text, is_active boolean)
language plpgsql security definer stable set search_path = public, pg_temp
as $filter_options$
declare v_is_admin boolean := public.is_admin();
begin
  if auth.uid() is null or public.is_active_tablet_session() then
    raise exception 'No tienes permiso para consultar los filtros de atenciones.' using errcode = '42501';
  end if;

  return query
  select options.option_type, options.id, options.name, options.is_active
  from (
    select 'SERVICE_CHANNEL'::text option_type, sc.id, sc.name, sc.is_active
    from public.service_channels sc
    where sc.is_active or exists (
      select 1 from public.customer_attentions ca
      where ca.service_channel_id = sc.id and (ca.status = 'ACTIVE' or v_is_admin)
    )
    union all
    select 'WORKSTATION'::text option_type, w.id, w.name, w.is_active
    from public.workstations w
    where w.is_active or exists (
      select 1
      from public.attention_surveys survey
      join public.customer_attentions ca on ca.id = survey.attention_id
      where survey.workstation_id = w.id and (ca.status = 'ACTIVE' or v_is_admin)
    )
  ) options
  order by options.option_type, options.is_active desc, options.name;
end;
$filter_options$;
;

alter function public.list_attention_filter_options() owner to postgres;
revoke execute on function public.list_attention_filter_options() from public, anon;
grant execute on function public.list_attention_filter_options() to authenticated;

create or replace function public.list_customer_attentions_v4(
  p_page integer default 1, p_limit integer default 10, p_search text default '',
  p_survey_status text default null, p_referral_status text default null,
  p_area_id uuid default null, p_admission_process_id uuid default null,
  p_service_channel_id uuid default null, p_workstation_id uuid default null
)
returns table (
  id uuid, rac_code text, attention_status text, requester_type text,
  client_dni text, client_name text, service_channel_id uuid,
  service_channel_name text, workstation_id uuid, workstation_name text,
  created_by_name text, created_at timestamptz, survey_status text,
  referral_status text, referral_area_id uuid, referral_area_name text,
  total_count bigint
)
language plpgsql security definer stable set search_path = public, pg_temp
as $attention_list$
declare
  v_is_admin boolean := public.is_admin();
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 100));
  v_search text := btrim(coalesce(p_search, ''));
begin
  if auth.uid() is null or public.is_active_tablet_session() then
    raise exception 'No tienes permiso para consultar atenciones.' using errcode = '42501';
  end if;

  return query
  select ca.id, ca.rac_code, ca.status, ca.requester_type,
    client.dni, client.display_name, channel.id, channel.name,
    workstation.id, workstation.name, ca.created_by_name, ca.created_at,
    coalesce(survey.status, 'NONE'), coalesce(referral.status, 'NONE'),
    referral.destination_area_id, referral.destination_area_name, count(*) over()
  from public.customer_attentions ca
  join public.clients client on client.id = ca.client_id
  join public.service_channels channel on channel.id = ca.service_channel_id
  left join public.attention_surveys survey on survey.attention_id = ca.id
  left join public.workstations workstation on workstation.id = survey.workstation_id
  left join public.attention_referrals referral on referral.attention_id = ca.id
  where (ca.status = 'ACTIVE' or v_is_admin)
    and (v_search = '' or ca.rac_code ilike '%' || v_search || '%'
      or client.display_name ilike '%' || v_search || '%'
      or client.email ilike '%' || v_search || '%'
      or (regexp_replace(v_search, '[^0-9]', '', 'g') <> ''
        and client.dni ilike '%' || regexp_replace(v_search, '[^0-9]', '', 'g') || '%'))
    and (p_survey_status is null or coalesce(survey.status, 'NONE') = p_survey_status)
    and (p_referral_status is null or coalesce(referral.status, 'NONE') = p_referral_status)
    and (p_area_id is null or referral.destination_area_id = p_area_id)
    and (p_service_channel_id is null or ca.service_channel_id = p_service_channel_id)
    and (p_workstation_id is null or survey.workstation_id = p_workstation_id)
    and (p_admission_process_id is null or exists (
      select 1 from public.attention_admission_processes process_link
      where process_link.attention_id = ca.id
        and process_link.admission_process_id = p_admission_process_id
    ))
  order by ca.created_at desc, ca.id desc
  limit v_limit offset (v_page - 1) * v_limit;
end;
$attention_list$;
;

alter function public.list_customer_attentions_v4(integer,integer,text,text,text,uuid,uuid,uuid,uuid) owner to postgres;
revoke execute on function public.list_customer_attentions_v4(integer,integer,text,text,text,uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.list_customer_attentions_v4(integer,integer,text,text,text,uuid,uuid,uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
