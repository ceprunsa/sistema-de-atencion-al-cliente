-- Verificacion estructural no destructiva de la etapa 1 del modulo de quejas.
select 'areas_have_active_state' as test,
  count(*) = 4 as passed
from information_schema.columns
where table_schema = 'public'
  and table_name = 'areas'
  and column_name in ('is_active', 'disabled_by', 'disabled_by_name', 'disabled_at')
union all
select 'complaint_core_tables_exist',
  (
    select count(*) = 11
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'complaint_settings', 'complaint_counters', 'sac_counters',
        'complaints', 'complaint_action_versions', 'complaint_response_tokens',
        'complaint_closure_reviews', 'complaint_sac_decisions',
        'corrective_action_requests', 'complaint_communications',
        'complaint_events'
      )
  )
union all
select 'complaint_tables_have_rls',
  (
    select count(*) = 11 and bool_and(c.relrowsecurity)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'complaint_settings', 'complaint_counters', 'sac_counters',
        'complaints', 'complaint_action_versions', 'complaint_response_tokens',
        'complaint_closure_reviews', 'complaint_sac_decisions',
        'corrective_action_requests', 'complaint_communications',
        'complaint_events'
      )
  )
union all
select 'complaint_access_functions_exist',
  to_regprocedure('public.can_create_complaints()') is not null
    and to_regprocedure('public.can_view_complaint(uuid)') is not null
    and to_regprocedure('public.can_manage_responsible_complaint(uuid)') is not null
    and to_regprocedure('public.can_manage_closure_complaint(uuid)') is not null
union all
select 'complaint_configuration_functions_exist',
  to_regprocedure('public.set_complaint_closure_area(uuid)') is not null
    and to_regprocedure('public.get_complaint_closure_area()') is not null
    and to_regprocedure('public.set_area_active(uuid,boolean)') is not null
union all
select 'complaint_counter_functions_exist',
  to_regprocedure('public.reserve_complaint_code()') is not null
    and to_regprocedure('public.reserve_sac_code()') is not null
union all
select 'counter_functions_are_private',
  not coalesce(
    has_function_privilege(
      'authenticated', 'public.reserve_complaint_code()', 'EXECUTE'
    ),
    false
  )
  and not coalesce(
    has_function_privilege(
      'authenticated', 'public.reserve_sac_code()', 'EXECUTE'
    ),
    false
  )
  and not coalesce(
    has_function_privilege(
      'anon', 'public.reserve_complaint_code()', 'EXECUTE'
    ),
    false
  )
  and not coalesce(
    has_function_privilege(
      'anon', 'public.reserve_sac_code()', 'EXECUTE'
    ),
    false
  )
union all
select 'authenticated_cannot_mutate_complaint_tables',
  not has_table_privilege('authenticated', 'public.complaints', 'INSERT')
    and not has_table_privilege('authenticated', 'public.complaints', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.complaints', 'DELETE')
    and not has_table_privilege(
      'authenticated', 'public.complaint_action_versions', 'INSERT'
    )
    and not has_table_privilege(
      'authenticated', 'public.complaint_response_tokens', 'UPDATE'
    )
    and not has_table_privilege(
      'authenticated', 'public.complaint_events', 'INSERT'
    )
union all
select 'complaint_select_policies_exist',
  (
    select count(*) = 9
    from pg_policies
    where schemaname = 'public'
      and policyname in (
        'complaint_settings_select_active_users',
        'complaints_select_authorized',
        'complaint_action_versions_select_authorized',
        'complaint_response_tokens_select_authorized',
        'complaint_closure_reviews_select_authorized',
        'complaint_sac_decisions_select_authorized',
        'corrective_action_requests_select_authorized',
        'complaint_communications_select_authorized',
        'complaint_events_select_authorized'
      )
  )
union all
select 'single_open_response_index_exists',
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'complaint_response_tokens'
      and indexname = 'complaint_response_tokens_one_open_idx'
  )
union all
select 'complaint_identity_guard_exists',
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.complaints'::regclass
      and tgname = 'complaints_guard_identity_update'
      and not tgisinternal
  )
union all
select 'area_deactivation_guard_exists',
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.areas'::regclass
      and tgname = 'areas_guard_complaint_deactivation'
      and not tgisinternal
  );
