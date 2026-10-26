-- Etapa 5: Dashboard estadistico agregado en PostgreSQL.
begin;

create index if not exists customer_attentions_dashboard_idx
  on public.customer_attentions (status, created_at, created_by);
create index if not exists attention_referrals_dashboard_idx
  on public.attention_referrals (referred_at, status, attention_id);
create index if not exists attention_surveys_dashboard_idx
  on public.attention_surveys (created_at, status, response, attention_id);
create index if not exists referral_surveys_dashboard_idx
  on public.referral_surveys (created_at, status, response, referral_id);

create or replace function public.get_dashboard_statistics(
  p_date_from date,
  p_date_to date,
  p_admission_process_id uuid default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_result jsonb;
  v_from timestamptz;
  v_to_exclusive timestamptz;
begin
  if v_user_id is null or public.is_active_tablet_session() then
    raise exception 'No tienes permiso para consultar el Dashboard.';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.status = 'active'
  ) then
    raise exception 'Tu usuario no esta activo.';
  end if;
  if p_date_from is null or p_date_to is null or p_date_from > p_date_to then
    raise exception 'El rango de fechas no es valido.';
  end if;
  if p_admission_process_id is not null and not exists (
    select 1 from public.admission_processes ap
    where ap.id = p_admission_process_id
  ) then
    raise exception 'El proceso de admision no existe.';
  end if;

  v_is_admin := public.is_admin();
  v_from := p_date_from::timestamp at time zone 'America/Lima';
  v_to_exclusive := (p_date_to + 1)::timestamp at time zone 'America/Lima';

  with
  scoped_attentions as materialized (
    select ca.id, ca.service_channel_id
    from public.customer_attentions ca
    where ca.status = 'ACTIVE'
      and (v_is_admin or ca.created_by = v_user_id)
      and ca.created_at >= v_from
      and ca.created_at < v_to_exclusive
      and (
        p_admission_process_id is null
        or exists (
          select 1 from public.attention_admission_processes aap
          where aap.attention_id = ca.id
            and aap.admission_process_id = p_admission_process_id
        )
      )
  ),
  scoped_referrals as materialized (
    select ar.id, ar.status
    from public.attention_referrals ar
    join public.customer_attentions ca on ca.id = ar.attention_id
    where ca.status = 'ACTIVE'
      and (v_is_admin or ca.created_by = v_user_id)
      and ar.referred_at >= v_from
      and ar.referred_at < v_to_exclusive
      and (
        p_admission_process_id is null
        or exists (
          select 1 from public.attention_admission_processes aap
          where aap.attention_id = ca.id
            and aap.admission_process_id = p_admission_process_id
        )
      )
  ),
  survey_events as materialized (
    select 'ATTENTION'::text as kind, s.status, s.response
    from public.attention_surveys s
    join public.customer_attentions ca on ca.id = s.attention_id
    where ca.status = 'ACTIVE'
      and (v_is_admin or ca.created_by = v_user_id)
      and s.created_at >= v_from
      and s.created_at < v_to_exclusive
      and (
        p_admission_process_id is null
        or exists (
          select 1 from public.attention_admission_processes aap
          where aap.attention_id = ca.id
            and aap.admission_process_id = p_admission_process_id
        )
      )
    union all
    select 'REFERRAL'::text, rs.status, rs.response
    from public.referral_surveys rs
    join public.attention_referrals ar on ar.id = rs.referral_id
    join public.customer_attentions ca on ca.id = ar.attention_id
    where ca.status = 'ACTIVE'
      and (v_is_admin or ca.created_by = v_user_id)
      and rs.created_at >= v_from
      and rs.created_at < v_to_exclusive
      and (
        p_admission_process_id is null
        or exists (
          select 1 from public.attention_admission_processes aap
          where aap.attention_id = ca.id
            and aap.admission_process_id = p_admission_process_id
        )
      )
  ),
  channel_data as (
    select sc.id::text as key, sc.name as label, sc.category,
      count(sa.id)::bigint as count
    from scoped_attentions sa
    join public.service_channels sc on sc.id = sa.service_channel_id
    group by sc.id, sc.name, sc.category
  ),
  workstation_data as (
    select coalesce(w.id::text, 'NONE') as key,
      coalesce(w.name, 'Sin mesa registrada') as label,
      count(sa.id)::bigint as count
    from scoped_attentions sa
    left join public.attention_surveys s on s.attention_id = sa.id
    left join public.workstations w on w.id = s.workstation_id
    group by w.id, w.name
  ),
  process_data as (
    select ap.id::text as key,
      concat(
        case ap.phase
          when 'CEPRUNSA_I' then 'Ceprunsa I fase'
          when 'CEPRUNSA_QUINTOS' then 'Ceprunsa Ciclo Quintos'
          when 'CEPRUNSA_II' then 'Ceprunsa II fase'
          when 'EXTRAORDINARIO' then 'Extraordinario'
          else ap.custom_label
        end,
        ' ', ap.year
      ) as label,
      count(*)::bigint as count
    from scoped_attentions sa
    join public.attention_admission_processes aap on aap.attention_id = sa.id
    join public.admission_processes ap on ap.id = aap.admission_process_id
    group by ap.id, ap.phase, ap.custom_label, ap.year
  ),
  response_values(key, label, score, display_order) as (
    values
      ('VERY_SATISFIED', 'Muy satisfecho', 100, 1),
      ('SATISFIED', 'Satisfecho', 75, 2),
      ('DISSATISFIED', 'Insatisfecho', 25, 3),
      ('VERY_DISSATISFIED', 'Muy insatisfecho', 0, 4)
  ),
  response_data as (
    select rv.key, rv.label, rv.score, rv.display_order,
      count(se.response)::bigint as count
    from response_values rv
    left join survey_events se
      on se.status = 'COMPLETED' and se.response = rv.key
    group by rv.key, rv.label, rv.score, rv.display_order
  ),
  survey_kinds(kind, display_order) as (
    values ('ATTENTION', 1), ('REFERRAL', 2)
  ),
  survey_data as (
    select sk.kind, sk.display_order,
      count(*) filter (where se.status = 'COMPLETED')::bigint as completed,
      count(*) filter (where se.status = 'SKIPPED')::bigint as skipped,
      count(*) filter (where se.status in ('PENDING_DECISION', 'QUEUED', 'SENT'))::bigint as pending,
      count(*) filter (where se.status = 'CANCELLED')::bigint as cancelled
    from survey_kinds sk
    left join survey_events se on se.kind = sk.kind
    group by sk.kind, sk.display_order
  )
  select jsonb_build_object(
    'scope', case when v_is_admin then 'GLOBAL' else 'OWN' end,
    'dateFrom', p_date_from::text,
    'dateTo', p_date_to::text,
    'activeAttentionsOnly', true,
    'totalAttentions', (select count(*) from scoped_attentions),
    'referrals', jsonb_build_object(
      'total', (select count(*) from scoped_referrals),
      'pending', (select count(*) from scoped_referrals where status = 'PENDING'),
      'resolved', (select count(*) from scoped_referrals where status = 'RESOLVED')
    ),
    'satisfaction', jsonb_build_object(
      'validResponses', (select sum(count) from response_data),
      'score', (
        select case when sum(count) = 0 then null
          else round(sum(count * score)::numeric / sum(count), 1)
        end
        from response_data
      ),
      'responses', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'key', key, 'label', label, 'count', count
        ) order by display_order), '[]'::jsonb)
        from response_data
      )
    ),
    'byChannel', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', key, 'label', label, 'category', category, 'count', count
      ) order by count desc, label), '[]'::jsonb)
      from channel_data
    ),
    'byWorkstation', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', key, 'label', label, 'count', count
      ) order by count desc, label), '[]'::jsonb)
      from workstation_data
    ),
    'byAdmissionProcess', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', key, 'label', label, 'count', count
      ) order by count desc, label), '[]'::jsonb)
      from process_data
    ),
    'surveys', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'kind', kind, 'completed', completed, 'skipped', skipped,
        'pending', pending, 'cancelled', cancelled
      ) order by display_order), '[]'::jsonb)
      from survey_data
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.get_dashboard_statistics(date, date, uuid)
from public, anon;
grant execute on function public.get_dashboard_statistics(date, date, uuid)
to authenticated;

notify pgrst, 'reload schema';
commit;

