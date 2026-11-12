-- Verificacion estructural no destructiva de la etapa 3 de quejas.
select 'complaint_listing_functions_exist' as test,
  to_regprocedure(
    'public.list_complaints(integer,integer,text,text,uuid,text)'
  ) is not null
    and to_regprocedure('public.get_pending_complaint_count()') is not null
    and to_regprocedure('public.get_complaint_detail(uuid)') is not null as passed
union all
select 'anonymous_cannot_read_complaint_rpc',
  not coalesce(has_function_privilege(
    'anon',
    'public.list_complaints(integer,integer,text,text,uuid,text)',
    'EXECUTE'
  ), false)
  and not coalesce(has_function_privilege(
    'anon', 'public.get_pending_complaint_count()', 'EXECUTE'
  ), false)
  and not coalesce(has_function_privilege(
    'anon', 'public.get_complaint_detail(uuid)', 'EXECUTE'
  ), false)
union all
select 'authenticated_can_read_complaint_rpc',
  coalesce(has_function_privilege(
    'authenticated',
    'public.list_complaints(integer,integer,text,text,uuid,text)',
    'EXECUTE'
  ), false)
  and coalesce(has_function_privilege(
    'authenticated', 'public.get_pending_complaint_count()', 'EXECUTE'
  ), false)
  and coalesce(has_function_privilege(
    'authenticated', 'public.get_complaint_detail(uuid)', 'EXECUTE'
  ), false)
union all
select 'complaint_list_enforces_visibility',
  position('is_admin()' in pg_get_functiondef(
    'public.list_complaints(integer,integer,text,text,uuid,text)'::regprocedure
  )) > 0
  and position('created_by' in pg_get_functiondef(
    'public.list_complaints(integer,integer,text,text,uuid,text)'::regprocedure
  )) > 0
  and position('responsible_area_id' in pg_get_functiondef(
    'public.list_complaints(integer,integer,text,text,uuid,text)'::regprocedure
  )) > 0
union all
select 'complaint_detail_does_not_expose_response_token',
  position('token_hash' in pg_get_functiondef(
    'public.get_complaint_detail(uuid)'::regprocedure
  )) = 0;
