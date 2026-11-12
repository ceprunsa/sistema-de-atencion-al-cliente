-- Auditoria integral no destructiva del modulo de quejas.
-- Ejecutar despues de los SQL 20 al 25.
select 'required_complaint_tables_exist' as test,
  (
    select count(*) = 11
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'complaint_settings', 'complaint_counters', 'sac_counters',
        'complaints', 'complaint_action_versions',
        'complaint_response_tokens', 'complaint_closure_reviews',
        'complaint_sac_decisions', 'corrective_action_requests',
        'complaint_communications', 'complaint_events'
      )
  ) as passed,
  null::bigint as violations
union all
select 'required_workflow_functions_exist',
  to_regprocedure('public.create_complaint(uuid,jsonb,uuid,uuid,uuid,text)') is not null
    and to_regprocedure('public.list_complaints(integer,integer,text,text,uuid,text)') is not null
    and to_regprocedure('public.get_complaint_detail(uuid)') is not null
    and to_regprocedure('public.start_complaint_management(uuid)') is not null
    and to_regprocedure('public.submit_complaint_management(uuid,boolean,text,text,text)') is not null
    and to_regprocedure('public.get_public_complaint_response(uuid)') is not null
    and to_regprocedure('public.respond_public_complaint(uuid,boolean,text)') is not null
    and to_regprocedure('public.expire_pending_complaint_responses()') is not null
    and to_regprocedure('public.review_complaint_closure(uuid,boolean,text)') is not null
    and to_regprocedure('public.decide_complaint_sac(uuid,boolean,text)') is not null,
  null::bigint
union all
select 'complaint_tables_have_rls',
  (
    select count(*) = 8
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'complaints', 'complaint_action_versions',
        'complaint_response_tokens', 'complaint_closure_reviews',
        'complaint_sac_decisions', 'corrective_action_requests',
        'complaint_communications', 'complaint_events'
      )
      and c.relrowsecurity
  ),
  null::bigint
union all
select 'authenticated_cannot_mutate_complaint_tables_directly',
  not exists (
    select 1
    from (values
      ('complaints'),
      ('complaint_action_versions'),
      ('complaint_response_tokens'),
      ('complaint_closure_reviews'),
      ('complaint_sac_decisions'),
      ('corrective_action_requests'),
      ('complaint_communications'),
      ('complaint_events')
    ) as protected(table_name)
    where has_table_privilege(
      'authenticated', 'public.' || protected.table_name, 'INSERT'
    ) or has_table_privilege(
      'authenticated', 'public.' || protected.table_name, 'UPDATE'
    ) or has_table_privilege(
      'authenticated', 'public.' || protected.table_name, 'DELETE'
    )
  ),
  null::bigint
union all
select 'public_response_rpc_is_service_only',
  not has_function_privilege(
    'anon', 'public.get_public_complaint_response(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'public.get_public_complaint_response(uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'public.get_public_complaint_response(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.respond_public_complaint(uuid,boolean,text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'public.respond_public_complaint(uuid,boolean,text)', 'EXECUTE'
  ),
  null::bigint
union all
select 'response_token_not_exposed_by_detail',
  position('token_hash' in pg_get_functiondef(
    'public.get_complaint_detail(uuid)'::regprocedure
  )) = 0,
  null::bigint
union all
select 'email_outbox_supports_complete_complaint_flow',
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.email_outbox'::regclass
      and conname = 'email_outbox_event_type_check'
      and pg_get_constraintdef(oid) like '%COMPLAINT_CREATED%'
      and pg_get_constraintdef(oid) like '%COMPLAINT_RESPONSE_REQUESTED%'
      and pg_get_constraintdef(oid) like '%COMPLAINT_CLOSURE_PENDING%'
      and pg_get_constraintdef(oid) like '%COMPLAINT_CLOSURE_RETURNED%'
  ),
  null::bigint
union all
select 'complaint_and_sac_codes_are_unique',
  not exists (
    select complaint_code from public.complaints
    group by complaint_code having count(*) > 1
  )
  and not exists (
    select complaint_year, complaint_number from public.complaints
    group by complaint_year, complaint_number having count(*) > 1
  )
  and not exists (
    select sac_code from public.corrective_action_requests
    group by sac_code having count(*) > 1
  )
  and not exists (
    select sac_year, sac_number from public.corrective_action_requests
    group by sac_year, sac_number having count(*) > 1
  ),
  (
    select count(*) from (
      select complaint_code from public.complaints
      group by complaint_code having count(*) > 1
      union all
      select sac_code from public.corrective_action_requests
      group by sac_code having count(*) > 1
    ) duplicates
  )::bigint
union all
select 'current_action_version_is_consistent',
  not exists (
    select 1
    from public.complaints c
    where c.current_action_version <> coalesce((
      select max(av.version_number)
      from public.complaint_action_versions av
      where av.complaint_id = c.id
    ), 0)
  ),
  (
    select count(*)
    from public.complaints c
    where c.current_action_version <> coalesce((
      select max(av.version_number)
      from public.complaint_action_versions av
      where av.complaint_id = c.id
    ), 0)
  )::bigint
union all
select 'open_response_token_matches_waiting_status',
  not exists (
    select 1
    from public.complaints c
    where (
      c.status = 'WAITING_CLIENT_RESPONSE'
      and 1 <> (
        select count(*) from public.complaint_response_tokens rt
        where rt.complaint_id = c.id and rt.status in ('QUEUED', 'SENT')
      )
    ) or (
      c.status <> 'WAITING_CLIENT_RESPONSE'
      and exists (
        select 1 from public.complaint_response_tokens rt
        where rt.complaint_id = c.id and rt.status in ('QUEUED', 'SENT')
      )
    )
  ),
  (
    select count(*)
    from public.complaints c
    where (
      c.status = 'WAITING_CLIENT_RESPONSE'
      and 1 <> (
        select count(*) from public.complaint_response_tokens rt
        where rt.complaint_id = c.id and rt.status in ('QUEUED', 'SENT')
      )
    ) or (
      c.status <> 'WAITING_CLIENT_RESPONSE'
      and exists (
        select 1 from public.complaint_response_tokens rt
        where rt.complaint_id = c.id and rt.status in ('QUEUED', 'SENT')
      )
    )
  )::bigint
union all
select 'response_tokens_reference_matching_versions',
  not exists (
    select 1
    from public.complaint_response_tokens rt
    join public.complaint_action_versions av on av.id = rt.action_version_id
    where av.complaint_id <> rt.complaint_id
  ),
  (
    select count(*)
    from public.complaint_response_tokens rt
    join public.complaint_action_versions av on av.id = rt.action_version_id
    where av.complaint_id <> rt.complaint_id
  )::bigint
union all
select 'sac_decision_and_request_are_consistent',
  not exists (
    select 1
    from public.complaint_sac_decisions sd
    left join public.corrective_action_requests sac
      on sac.complaint_id = sd.complaint_id
    where (sd.should_create_sac and sac.id is null)
      or (not sd.should_create_sac and sac.id is not null)
  )
  and not exists (
    select 1
    from public.corrective_action_requests sac
    left join public.complaint_sac_decisions sd
      on sd.complaint_id = sac.complaint_id
    where sd.id is null or not sd.should_create_sac
  ),
  (
    select count(*)
    from public.complaint_sac_decisions sd
    left join public.corrective_action_requests sac
      on sac.complaint_id = sd.complaint_id
    where (sd.should_create_sac and sac.id is null)
      or (not sd.should_create_sac and sac.id is not null)
  )::bigint
union all
select 'closed_agreed_has_sac_decision',
  not exists (
    select 1
    from public.complaints c
    left join public.complaint_sac_decisions sd on sd.complaint_id = c.id
    where c.status = 'CLOSED_AGREED' and sd.id is null
  ),
  (
    select count(*)
    from public.complaints c
    left join public.complaint_sac_decisions sd on sd.complaint_id = c.id
    where c.status = 'CLOSED_AGREED' and sd.id is null
  )::bigint;
