-- Verificacion no destructiva: serie temporal del Dashboard.
select 'dashboard_v2_function_exists' as test,
  to_regprocedure('public.get_dashboard_statistics_v2(date,date,uuid)') is not null as passed
union all
select 'dashboard_v2_authenticated_execute',
  has_function_privilege(
    'authenticated',
    'public.get_dashboard_statistics_v2(date,date,uuid)',
    'execute'
  )
union all
select 'dashboard_v2_anon_denied',
  not has_function_privilege(
    'anon',
    'public.get_dashboard_statistics_v2(date,date,uuid)',
    'execute'
  );
