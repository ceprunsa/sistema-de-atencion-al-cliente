-- Auditoria integral de listado y exportaciones RAC. Solo lectura.
-- Ejecutar despues de los SQL 27, 28 y 29.

do $verify$
declare
  v_definition text;
  v_pgcrypto_schema text;
  v_export_search_path text;
begin
  if to_regprocedure('public.list_customer_attentions_v4(integer,integer,text,text,text,uuid,uuid,uuid,uuid)') is null then
    raise exception 'Falta list_customer_attentions_v4(...).';
  end if;
  if to_regprocedure('public.list_attention_filter_options()') is null then
    raise exception 'Falta list_attention_filter_options().';
  end if;
  if to_regclass('public.attention_export_jobs') is null then
    raise exception 'Falta attention_export_jobs.';
  end if;
  if to_regprocedure('public.request_attention_export(text,text,text,text,uuid,uuid,uuid,uuid,date,date)') is null then
    raise exception 'Falta request_attention_export(...).';
  end if;
  if to_regprocedure('public.get_attention_export_batch(uuid,timestamp with time zone,uuid,integer)') is null then
    raise exception 'Falta get_attention_export_batch(...).';
  end if;

  select pg_get_functiondef('public.list_customer_attentions_v4(integer,integer,text,text,text,uuid,uuid,uuid,uuid)'::regprocedure)
  into v_definition;
  if position('p_service_channel_id' in v_definition) = 0
    or position('p_workstation_id' in v_definition) = 0 then
    raise exception 'La RPC v4 no contiene ambos filtros nuevos.';
  end if;

  select pg_get_functiondef('public.get_attention_export_batch(uuid,timestamp with time zone,uuid,integer)'::regprocedure)
  into v_definition;
  if position('ca.created_by = v_job.requested_by' in v_definition) = 0
    or position('ca.status = ''ACTIVE''' in v_definition) = 0 then
    raise exception 'El lote no fuerza el alcance del usuario no administrador.';
  end if;

  if has_function_privilege('anon', 'public.request_attention_export(text,text,text,text,uuid,uuid,uuid,uuid,date,date)', 'EXECUTE') then
    raise exception 'anon no debe solicitar exportaciones.';
  end if;
  if not has_function_privilege('authenticated', 'public.request_attention_export(text,text,text,text,uuid,uuid,uuid,uuid,date,date)', 'EXECUTE') then
    raise exception 'authenticated debe poder solicitar exportaciones.';
  end if;
  if has_function_privilege('authenticated', 'public.get_attention_export_batch(uuid,timestamp with time zone,uuid,integer)', 'EXECUTE') then
    raise exception 'authenticated no debe leer lotes internos.';
  end if;
  if not has_function_privilege('service_role', 'public.get_attention_export_batch(uuid,timestamp with time zone,uuid,integer)', 'EXECUTE') then
    raise exception 'service_role debe poder leer lotes internos.';
  end if;

  if not exists (
    select 1 from pg_class
    where oid = 'public.attention_export_jobs'::regclass and relrowsecurity
  ) then
    raise exception 'RLS no esta habilitado para attention_export_jobs.';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'attention_export_jobs'
      and policyname = 'attention_export_jobs_select_own'
  ) then
    raise exception 'Falta la politica de lectura propia de exportaciones.';
  end if;
  if not exists (
    select 1 from storage.buckets
    where id = 'attention-exports' and not public
  ) then
    raise exception 'El bucket attention-exports no existe o es publico.';
  end if;

  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'customer_attentions_created_by_created_at_idx')
    or not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'customer_attentions_channel_created_at_idx')
    or not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'attention_surveys_workstation_attention_idx') then
    raise exception 'Falta uno de los indices del listado o exportacion.';
  end if;

  select namespace.nspname into v_pgcrypto_schema
  from pg_extension extension
  join pg_namespace namespace on namespace.oid = extension.extnamespace
  where extension.extname = 'pgcrypto';
  select array_to_string(proc.proconfig, ',') into v_export_search_path
  from pg_proc proc
  where proc.oid = 'public.request_attention_export(text,text,text,text,uuid,uuid,uuid,uuid,date,date)'::regprocedure;
  if v_pgcrypto_schema is null or position(v_pgcrypto_schema in coalesce(v_export_search_path, '')) = 0 then
    raise exception 'request_attention_export no puede resolver digest() desde pgcrypto.';
  end if;
end;
$verify$;

select status, count(*) as jobs, sum(total_rows) as requested_rows
from public.attention_export_jobs
group by status
order by status;

select
  count(*) filter (where status = 'PROCESSING' and started_at < now() - interval '15 minutes') as interrupted_jobs,
  count(*) filter (where status = 'COMPLETED' and expires_at <= now()) as expired_pending_cleanup,
  count(*) filter (where progress_rows > total_rows) as invalid_progress
from public.attention_export_jobs;

-- Resultado final esperado para la segunda consulta: 0, 0, 0.
