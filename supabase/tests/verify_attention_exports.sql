-- Verificacion estructural del backend de exportaciones. No genera archivos.

do $verify$
begin
  if to_regclass('public.attention_export_jobs') is null then
    raise exception 'Falta attention_export_jobs.';
  end if;
  if to_regprocedure('public.request_attention_export(text,text,text,text,uuid,uuid,uuid,uuid,date,date)') is null then
    raise exception 'Falta request_attention_export(...).';
  end if;
  if to_regprocedure('public.claim_attention_export_job(uuid)') is null then
    raise exception 'Falta claim_attention_export_job(uuid).';
  end if;
  if to_regprocedure('public.get_attention_export_batch(uuid,timestamp with time zone,uuid,integer)') is null then
    raise exception 'Falta get_attention_export_batch(...).';
  end if;
  if not exists (select 1 from storage.buckets where id = 'attention-exports' and not public) then
    raise exception 'Falta el bucket privado attention-exports.';
  end if;
  if not exists (select 1 from pg_class where oid = 'public.attention_export_jobs'::regclass and relrowsecurity) then
    raise exception 'RLS no esta habilitado en attention_export_jobs.';
  end if;
end;
$verify$;

select
  has_function_privilege('anon', 'public.request_attention_export(text,text,text,text,uuid,uuid,uuid,uuid,date,date)', 'EXECUTE') as anon_can_request,
  has_function_privilege('authenticated', 'public.request_attention_export(text,text,text,text,uuid,uuid,uuid,uuid,date,date)', 'EXECUTE') as authenticated_can_request,
  has_function_privilege('authenticated', 'public.get_attention_export_batch(uuid,timestamp with time zone,uuid,integer)', 'EXECUTE') as authenticated_can_read_batches,
  has_function_privilege('service_role', 'public.get_attention_export_batch(uuid,timestamp with time zone,uuid,integer)', 'EXECUTE') as service_can_read_batches;

-- Resultado esperado: false, true, false, true.
