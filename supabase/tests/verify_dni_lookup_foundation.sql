-- Verificación no destructiva de la etapa 2.
select 'dni_lookup_rate_limits_exists' as test,
  to_regclass('public.dni_lookup_rate_limits') is not null as passed
union all
select 'dni_lookup_attempts_exists',
  to_regclass('public.dni_lookup_attempts') is not null
union all
select 'consume_rate_limit_exists',
  to_regprocedure('public.consume_dni_lookup_rate_limit(uuid,text)') is not null
union all
select 'rate_limits_rls_enabled',
  coalesce((select relrowsecurity from pg_class where oid = 'public.dni_lookup_rate_limits'::regclass), false)
union all
select 'attempts_rls_enabled',
  coalesce((select relrowsecurity from pg_class where oid = 'public.dni_lookup_attempts'::regclass), false)
union all
select 'authenticated_cannot_read_limits',
  not has_table_privilege('authenticated', 'public.dni_lookup_rate_limits', 'select')
union all
select 'authenticated_cannot_read_attempts',
  not has_table_privilege('authenticated', 'public.dni_lookup_attempts', 'select')
union all
select 'authenticated_cannot_consume_limit',
  not has_function_privilege('authenticated', 'public.consume_dni_lookup_rate_limit(uuid,text)', 'execute');
