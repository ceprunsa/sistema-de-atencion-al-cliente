-- Verificacion estructural no destructiva de la etapa 6 de quejas.
select 'complaint_sac_decision_function_exists' as test,
  to_regprocedure(
    'public.decide_complaint_sac(uuid,boolean,text)'
  ) is not null as passed
union all
select 'anonymous_cannot_decide_complaint_sac',
  not coalesce(has_function_privilege(
    'anon',
    'public.decide_complaint_sac(uuid,boolean,text)',
    'EXECUTE'
  ), false)
union all
select 'authenticated_can_decide_complaint_sac',
  coalesce(has_function_privilege(
    'authenticated',
    'public.decide_complaint_sac(uuid,boolean,text)',
    'EXECUTE'
  ), false)
union all
select 'sac_decision_checks_closure_area_permission',
  position('can_manage_closure_complaint' in pg_get_functiondef(
    'public.decide_complaint_sac(uuid,boolean,text)'::regprocedure
  )) > 0
union all
select 'sac_code_is_reserved_transactionally',
  position('reserve_sac_code' in pg_get_functiondef(
    'public.decide_complaint_sac(uuid,boolean,text)'::regprocedure
  )) > 0
union all
select 'one_sac_decision_per_complaint',
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.complaint_sac_decisions'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) like '%(complaint_id)%'
  )
union all
select 'one_sac_per_complaint',
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.corrective_action_requests'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) like '%(complaint_id)%'
  )
union all
select 'regular_flow_closes_after_sac_decision',
  position('CLOSED_AGREED' in pg_get_functiondef(
    'public.decide_complaint_sac(uuid,boolean,text)'::regprocedure
  )) > 0
union all
select 'no_response_closure_is_preserved',
  position('CLOSED_NO_RESPONSE' in pg_get_functiondef(
    'public.decide_complaint_sac(uuid,boolean,text)'::regprocedure
  )) > 0
  and position('followUpOnly' in pg_get_functiondef(
    'public.decide_complaint_sac(uuid,boolean,text)'::regprocedure
  )) > 0;
