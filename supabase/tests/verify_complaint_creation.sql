-- Verificacion estructural no destructiva de la etapa 2 de quejas.
select 'complaint_request_id_is_required' as test,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'complaints'
      and column_name = 'request_id'
      and is_nullable = 'NO'
  ) as passed
union all
select 'complaint_request_id_is_unique',
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'complaints'
      and indexname = 'complaints_request_id_uidx'
  )
union all
select 'complaint_creation_functions_exist',
  to_regprocedure('public.find_attention_for_complaint(text)') is not null
    and to_regprocedure(
      'public.create_complaint(uuid,jsonb,uuid,uuid,uuid,text)'
    ) is not null
union all
select 'anonymous_cannot_create_complaints',
  not coalesce(
    has_function_privilege(
      'anon',
      'public.create_complaint(uuid,jsonb,uuid,uuid,uuid,text)',
      'EXECUTE'
    ),
    false
  )
union all
select 'authenticated_can_use_creation_functions',
  coalesce(
    has_function_privilege(
      'authenticated',
      'public.create_complaint(uuid,jsonb,uuid,uuid,uuid,text)',
      'EXECUTE'
    ),
    false
  )
  and coalesce(
    has_function_privilege(
      'authenticated',
      'public.find_attention_for_complaint(text)',
      'EXECUTE'
    ),
    false
  )
union all
select 'complaint_outbox_event_is_allowed',
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.email_outbox'::regclass
      and conname = 'email_outbox_event_type_check'
      and pg_get_constraintdef(oid) like '%COMPLAINT_CREATED%'
  )
union all
select 'complaint_outbox_aggregate_is_allowed',
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.email_outbox'::regclass
      and conname = 'email_outbox_aggregate_type_check'
      and pg_get_constraintdef(oid) like '%COMPLAINT%'
  )
union all
select 'complaint_description_is_bounded',
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.complaints'::regclass
      and conname = 'complaints_description_length_check'
  )
union all
select 'complaint_identity_guard_includes_request',
  position(
    'request_id' in pg_get_functiondef(
      'public.guard_complaint_identity_update()'::regprocedure
    )
  ) > 0;
