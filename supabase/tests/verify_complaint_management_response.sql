-- Verificacion estructural no destructiva de la etapa 4 de quejas.
select 'complaint_management_functions_exist' as test,
  to_regprocedure('public.start_complaint_management(uuid)') is not null
    and to_regprocedure(
      'public.submit_complaint_management(uuid,boolean,text,text,text)'
    ) is not null as passed
union all
select 'public_response_functions_exist',
  to_regprocedure('public.get_public_complaint_response(uuid)') is not null
    and to_regprocedure(
      'public.respond_public_complaint(uuid,boolean,text)'
    ) is not null
    and to_regprocedure(
      'public.expire_pending_complaint_responses()'
    ) is not null
union all
select 'anonymous_cannot_manage_complaints',
  not coalesce(has_function_privilege(
    'anon', 'public.start_complaint_management(uuid)', 'EXECUTE'
  ), false)
  and not coalesce(has_function_privilege(
    'anon',
    'public.submit_complaint_management(uuid,boolean,text,text,text)',
    'EXECUTE'
  ), false)
union all
select 'authenticated_can_manage_responsible_complaints',
  coalesce(has_function_privilege(
    'authenticated', 'public.start_complaint_management(uuid)', 'EXECUTE'
  ), false)
  and coalesce(has_function_privilege(
    'authenticated',
    'public.submit_complaint_management(uuid,boolean,text,text,text)',
    'EXECUTE'
  ), false)
union all
select 'public_response_rpc_is_service_only',
  not coalesce(has_function_privilege(
    'anon', 'public.get_public_complaint_response(uuid)', 'EXECUTE'
  ), false)
  and not coalesce(has_function_privilege(
    'authenticated', 'public.get_public_complaint_response(uuid)', 'EXECUTE'
  ), false)
  and coalesce(has_function_privilege(
    'service_role', 'public.get_public_complaint_response(uuid)', 'EXECUTE'
  ), false)
  and not coalesce(has_function_privilege(
    'anon', 'public.respond_public_complaint(uuid,boolean,text)', 'EXECUTE'
  ), false)
  and not coalesce(has_function_privilege(
    'authenticated',
    'public.respond_public_complaint(uuid,boolean,text)',
    'EXECUTE'
  ), false)
union all
select 'complaint_response_email_is_allowed',
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.email_outbox'::regclass
      and conname = 'email_outbox_event_type_check'
      and pg_get_constraintdef(oid) like '%COMPLAINT_RESPONSE_REQUESTED%'
  )
  and exists (
    select 1 from pg_constraint
    where conrelid = 'public.email_outbox'::regclass
      and conname = 'email_outbox_template_key_check'
      and pg_get_constraintdef(oid) like '%COMPLAINT_RESPONSE_REQUESTED%'
  )
union all
select 'complaint_delivery_sync_trigger_exists',
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.email_outbox'::regclass
      and tgname = 'email_outbox_sync_complaint_response'
      and not tgisinternal
  )
union all
select 'response_tokens_are_hashed',
  position('digest' in pg_get_functiondef(
    'public.submit_complaint_management(uuid,boolean,text,text,text)'::regprocedure
  )) > 0
  and position('token_hash' in pg_get_functiondef(
    'public.get_public_complaint_response(uuid)'::regprocedure
  )) > 0;
