-- Mejora del Dashboard: serie temporal diaria o mensual en la misma respuesta.
begin;

create or replace function public.get_dashboard_statistics_v2(
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
  v_granularity text;
  v_from timestamptz;
  v_to_exclusive timestamptz;
  v_base jsonb;
  v_trend jsonb;
begin
  v_base := public.get_dashboard_statistics(
    p_date_from, p_date_to, p_admission_process_id
  );
  v_is_admin := public.is_admin();
  v_granularity := case
    when p_date_to - p_date_from <= 62 then 'DAY'
    else 'MONTH'
  end;
  v_from := p_date_from::timestamp at time zone 'America/Lima';
  v_to_exclusive := (p_date_to + 1)::timestamp at time zone 'America/Lima';

  with buckets as (
    select
      day_value::date as bucket_date,
      to_char(day_value, 'DD/MM') as label
    from generate_series(
      p_date_from::timestamp,
      p_date_to::timestamp,
      interval '1 day'
    ) day_value
    where v_granularity = 'DAY'

    union all

    select
      month_value::date,
      to_char(month_value, 'MM/YYYY')
    from generate_series(
      date_trunc('month', p_date_from::timestamp),
      date_trunc('month', p_date_to::timestamp),
      interval '1 month'
    ) month_value
    where v_granularity = 'MONTH'
  ),
  counts as (
    select
      case
        when v_granularity = 'DAY'
          then (ca.created_at at time zone 'America/Lima')::date
        else date_trunc(
          'month', ca.created_at at time zone 'America/Lima'
        )::date
      end as bucket_date,
      count(*)::bigint as count
    from public.customer_attentions ca
    where ca.status = 'ACTIVE'
      and (v_is_admin or ca.created_by = v_user_id)
      and ca.created_at >= v_from
      and ca.created_at < v_to_exclusive
      and (
        p_admission_process_id is null
        or exists (
          select 1
          from public.attention_admission_processes aap
          where aap.attention_id = ca.id
            and aap.admission_process_id = p_admission_process_id
        )
      )
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', b.bucket_date::text,
        'label', b.label,
        'count', coalesce(c.count, 0)
      )
      order by b.bucket_date
    ),
    '[]'::jsonb
  )
  into v_trend
  from buckets b
  left join counts c on c.bucket_date = b.bucket_date;

  return v_base || jsonb_build_object(
    'trendGranularity', v_granularity,
    'attentionTrend', v_trend
  );
end;
$$;

revoke execute on function public.get_dashboard_statistics_v2(date, date, uuid)
from public, anon;
grant execute on function public.get_dashboard_statistics_v2(date, date, uuid)
to authenticated;

notify pgrst, 'reload schema';
commit;

