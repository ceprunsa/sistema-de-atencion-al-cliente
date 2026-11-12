-- Verificacion estructural no destructiva de la etapa 5 de quejas.
select 'complaint_closure_review_function_exists' as test,
  to_regprocedure(
    'public.review_complaint_closure(uuid,boolean,text)'
  ) is not null as passed
union all
select 'anonymous_cannot_review_complaint_closure',
  not coalesce(has_function_privilege(
    'anon',
    'public.review_complaint_closure(uuid,boolean,text)',
    'EXECUTE'
  ), false)
union all
select 'authenticated_can_review_complaint_closure',
  coalesce(has_function_privilege(
    'authenticated',
    'public.review_complaint_closure(uuid,boolean,text)',
    'EXECUTE'
  ), false)
union all
select 'closure_review_checks_area_permission',
  position('can_manage_closure_complaint' in pg_get_functiondef(
    'public.review_complaint_closure(uuid,boolean,text)'::regprocedure
  )) > 0
union all
select 'automatic_closure_status_is_preserved',
  position('CLOSED_NO_RESPONSE' in pg_get_functiondef(
    'public.review_complaint_closure(uuid,boolean,text)'::regprocedure
  )) > 0
  and position('automaticClosureFollowUp' in pg_get_functiondef(
    'public.review_complaint_closure(uuid,boolean,text)'::regprocedure
  )) > 0
union all
select 'closure_return_email_is_allowed',
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.email_outbox'::regclass
      and conname = 'email_outbox_event_type_check'
      and pg_get_constraintdef(oid) like '%COMPLAINT_CLOSURE_RETURNED%'
  )
  and exists (
    select 1 from pg_constraint
    where conrelid = 'public.email_outbox'::regclass
      and conname = 'email_outbox_template_key_check'
      and pg_get_constraintdef(oid) like '%COMPLAINT_CLOSURE_RETURNED%'
  )
union all
select 'pending_count_includes_closure_work',
  position('PENDING_CLOSURE_REVIEW' in pg_get_functiondef(
    'public.get_pending_complaint_count()'::regprocedure
  )) > 0
  and position('PENDING_SAC_EVALUATION' in pg_get_functiondef(
    'public.get_pending_complaint_count()'::regprocedure
  )) > 0;
