-- Verificacion no destructiva: funcion e indices del Dashboard.
select 'dashboard_function_exists' as test,
  to_regprocedure('public.get_dashboard_statistics(date,date,uuid)') is not null as passed
union all
select 'dashboard_authenticated_execute',
  has_function_privilege(
    'authenticated',
    'public.get_dashboard_statistics(date,date,uuid)',
    'execute'
  )
union all
select 'dashboard_anon_denied',
  not has_function_privilege(
    'anon',
    'public.get_dashboard_statistics(date,date,uuid)',
    'execute'
  )
union all
select 'attentions_dashboard_index_exists',
  to_regclass('public.customer_attentions_dashboard_idx') is not null
union all
select 'referrals_dashboard_index_exists',
  to_regclass('public.attention_referrals_dashboard_idx') is not null
union all
select 'attention_surveys_dashboard_index_exists',
  to_regclass('public.attention_surveys_dashboard_idx') is not null
union all
select 'referral_surveys_dashboard_index_exists',
  to_regclass('public.referral_surveys_dashboard_idx') is not null;
