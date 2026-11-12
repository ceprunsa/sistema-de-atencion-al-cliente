-- Corrige la ambiguedad entre parametros de salida y columnas de correlativos.
-- Ejecutar manualmente en bases que ya aplicaron 20_complaints_foundation.sql.
begin;

create or replace function public.reserve_complaint_code()
returns table (
  complaint_year integer,
  complaint_number bigint,
  complaint_code text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_year integer := extract(year from timezone('America/Lima', now()))::integer;
  v_number bigint;
begin
  insert into public.complaint_counters as counters (
    complaint_year, last_value
  ) values (
    v_year, 1
  )
  on conflict on constraint complaint_counters_pkey do update
    set last_value = counters.last_value + 1
  returning counters.last_value into v_number;

  return query select v_year, v_number,
    'RQ-' || case when v_number < 1000 then lpad(v_number::text, 3, '0')
      else v_number::text end || '-' || v_year::text;
end;
$$;

alter function public.reserve_complaint_code() owner to postgres;

create or replace function public.reserve_sac_code()
returns table (
  sac_year integer,
  sac_number bigint,
  sac_code text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_year integer := extract(year from timezone('America/Lima', now()))::integer;
  v_number bigint;
begin
  insert into public.sac_counters as counters (
    sac_year, last_value
  ) values (
    v_year, 1
  )
  on conflict on constraint sac_counters_pkey do update
    set last_value = counters.last_value + 1
  returning counters.last_value into v_number;

  return query select v_year, v_number,
    'SAC-' || case when v_number < 1000 then lpad(v_number::text, 3, '0')
      else v_number::text end || '-' || v_year::text;
end;
$$;

alter function public.reserve_sac_code() owner to postgres;

revoke execute on function public.reserve_complaint_code()
  from public, anon, authenticated;
revoke execute on function public.reserve_sac_code()
  from public, anon, authenticated;
grant execute on function public.reserve_complaint_code()
  to service_role;
grant execute on function public.reserve_sac_code()
  to service_role;

commit;
