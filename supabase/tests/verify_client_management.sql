-- Verificacion estructural no destructiva del modulo de clientes.
select 'client_email_constraint_exists' as test,
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.clients'::regclass
      and conname = 'clients_email_format_check'
  ) as passed
union all
select 'client_identity_constraint_exists',
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.clients'::regclass
      and conname = 'clients_identity_completeness_check'
  )
union all
select 'client_normalization_trigger_exists',
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.clients'::regclass
      and tgname = 'clients_normalize_fields'
      and not tgisinternal
  )
union all
select 'client_admin_policy_exists',
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'clients'
      and policyname = 'clients_select_admin'
  )
union all
select 'legacy_authenticated_client_policy_removed',
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'clients'
      and policyname = 'clients_select_authenticated'
  )
union all
select 'authenticated_cannot_write_clients_directly',
  not has_table_privilege('authenticated', 'public.clients', 'INSERT')
    and not has_table_privilege('authenticated', 'public.clients', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.clients', 'DELETE')
union all
select 'admin_client_functions_exist',
  to_regprocedure('public.list_clients_admin(integer,integer,text)') is not null
    and to_regprocedure('public.get_client_admin(uuid)') is not null
    and to_regprocedure('public.create_client_admin(jsonb)') is not null
    and to_regprocedure('public.update_client_admin(uuid,jsonb,boolean)') is not null
    and to_regprocedure('public.list_client_attentions_admin(uuid,integer,integer)') is not null
union all
select 'operational_client_lookup_functions_exist',
  to_regprocedure('public.find_client_by_exact_dni(text)') is not null
    and to_regprocedure('public.find_clients_by_exact_email(text)') is not null
    and to_regprocedure('public.get_client_for_attention(uuid)') is not null
union all
select 'anonymous_cannot_execute_client_functions',
  not coalesce(has_function_privilege('anon', 'public.list_clients_admin(integer,integer,text)', 'EXECUTE'), false)
    and not coalesce(has_function_privilege('anon', 'public.get_client_admin(uuid)', 'EXECUTE'), false)
    and not coalesce(has_function_privilege('anon', 'public.create_client_admin(jsonb)', 'EXECUTE'), false)
    and not coalesce(has_function_privilege('anon', 'public.update_client_admin(uuid,jsonb,boolean)', 'EXECUTE'), false)
    and not coalesce(has_function_privilege('anon', 'public.list_client_attentions_admin(uuid,integer,integer)', 'EXECUTE'), false)
    and not coalesce(has_function_privilege('anon', 'public.find_client_by_exact_dni(text)', 'EXECUTE'), false)
    and not coalesce(has_function_privilege('anon', 'public.find_clients_by_exact_email(text)', 'EXECUTE'), false)
    and not coalesce(has_function_privilege('anon', 'public.get_client_for_attention(uuid)', 'EXECUTE'), false)
union all
select 'authenticated_can_execute_client_functions',
  coalesce(has_function_privilege('authenticated', 'public.list_clients_admin(integer,integer,text)', 'EXECUTE'), false)
    and coalesce(has_function_privilege('authenticated', 'public.get_client_admin(uuid)', 'EXECUTE'), false)
    and coalesce(has_function_privilege('authenticated', 'public.create_client_admin(jsonb)', 'EXECUTE'), false)
    and coalesce(has_function_privilege('authenticated', 'public.update_client_admin(uuid,jsonb,boolean)', 'EXECUTE'), false)
    and coalesce(has_function_privilege('authenticated', 'public.list_client_attentions_admin(uuid,integer,integer)', 'EXECUTE'), false)
    and coalesce(has_function_privilege('authenticated', 'public.find_client_by_exact_dni(text)', 'EXECUTE'), false)
    and coalesce(has_function_privilege('authenticated', 'public.find_clients_by_exact_email(text)', 'EXECUTE'), false)
    and coalesce(has_function_privilege('authenticated', 'public.get_client_for_attention(uuid)', 'EXECUTE'), false);
