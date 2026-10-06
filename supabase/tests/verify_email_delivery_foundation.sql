-- Verificación de solo lectura para la etapa 1 del servicio de correo.

select 'email_outbox_exists' as check_name,
  to_regclass('public.email_outbox') is not null as passed
union all
select 'email_delivery_attempts_exists',
  to_regclass('public.email_delivery_attempts') is not null
union all
select 'outbox_rls_enabled',
  coalesce((select relrowsecurity from pg_class where oid = 'public.email_outbox'::regclass), false)
union all
select 'attempts_rls_enabled',
  coalesce((select relrowsecurity from pg_class where oid = 'public.email_delivery_attempts'::regclass), false)
union all
select 'authenticated_cannot_select_outbox',
  not has_table_privilege('authenticated', 'public.email_outbox', 'select')
union all
select 'anon_cannot_select_outbox',
  not has_table_privilege('anon', 'public.email_outbox', 'select')
union all
select 'claim_function_exists',
  to_regprocedure('public.claim_email_outbox_batch(uuid,integer)') is not null
union all
select 'finish_function_exists',
  to_regprocedure('public.finish_email_outbox_attempt(uuid,uuid,text,text,text,text,timestamp with time zone,text,timestamp with time zone,integer)') is not null
union all
select 'authenticated_cannot_claim',
  not has_function_privilege('authenticated', 'public.claim_email_outbox_batch(uuid,integer)', 'execute')
union all
select 'service_role_can_claim',
  has_function_privilege('service_role', 'public.claim_email_outbox_batch(uuid,integer)', 'execute');
