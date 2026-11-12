-- Verificacion no destructiva del parche de correlativos RQ y SAC.
select 'complaint_counter_uses_named_constraint' as test,
  position(
    'ON CONFLICT ON CONSTRAINT complaint_counters_pkey'
    in pg_get_functiondef('public.reserve_complaint_code()'::regprocedure)
  ) > 0 as passed
union all
select 'sac_counter_uses_named_constraint',
  position(
    'ON CONFLICT ON CONSTRAINT sac_counters_pkey'
    in pg_get_functiondef('public.reserve_sac_code()'::regprocedure)
  ) > 0
union all
select 'counter_functions_keep_restricted_execution',
  not coalesce(has_function_privilege(
    'anon', 'public.reserve_complaint_code()', 'EXECUTE'
  ), false)
  and not coalesce(has_function_privilege(
    'authenticated', 'public.reserve_complaint_code()', 'EXECUTE'
  ), false)
  and not coalesce(has_function_privilege(
    'anon', 'public.reserve_sac_code()', 'EXECUTE'
  ), false)
  and not coalesce(has_function_privilege(
    'authenticated', 'public.reserve_sac_code()', 'EXECUTE'
  ), false);
