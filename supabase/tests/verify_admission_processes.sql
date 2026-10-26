-- Verificacion no destructiva: catalogo y relacion de procesos de admision.
select 'admission_processes_table_exists' as test,
  to_regclass('public.admission_processes') is not null as passed
union all
select 'attention_admission_processes_table_exists',
  to_regclass('public.attention_admission_processes') is not null
union all
select 'standard_process_unique_index_exists',
  to_regclass('public.admission_processes_standard_uidx') is not null
union all
select 'custom_process_unique_index_exists',
  to_regclass('public.admission_processes_custom_uidx') is not null
union all
select 'used_process_identity_guard_exists',
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.admission_processes'::regclass
      and tgname = 'admission_processes_preserve_used_identity'
      and not tgisinternal
  )
union all
select 'create_attention_v3_exists',
  to_regprocedure('public.create_customer_attention_v3(jsonb,uuid,text,text,jsonb,text,jsonb,uuid,uuid,text,text)') is not null
union all
select 'update_attention_v3_exists',
  to_regprocedure('public.update_customer_attention_v3(uuid,jsonb,uuid,text,text,jsonb,jsonb,uuid,uuid,text,text)') is not null
union all
select 'list_attentions_v3_exists',
  to_regprocedure('public.list_customer_attentions_v3(integer,integer,text,text,text,uuid,uuid)') is not null
union all
select 'create_attention_v3_authenticated_execute',
  has_function_privilege(
    'authenticated',
    'public.create_customer_attention_v3(jsonb,uuid,text,text,jsonb,text,jsonb,uuid,uuid,text,text)',
    'execute'
  )
union all
select 'create_attention_v3_anon_denied',
  not has_function_privilege(
    'anon',
    'public.create_customer_attention_v3(jsonb,uuid,text,text,jsonb,text,jsonb,uuid,uuid,text,text)',
    'execute'
  );
