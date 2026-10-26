-- Verificacion no destructiva: acceso al registro segun mesa y encuesta.
select 'registration_state_function_exists' as test,
  to_regprocedure('public.get_my_attention_registration_state()') is not null as passed
union all
select 'registration_state_authenticated_execute',
  has_function_privilege(
    'authenticated',
    'public.get_my_attention_registration_state()',
    'execute'
  )
union all
select 'registration_state_anon_denied',
  not has_function_privilege(
    'anon',
    'public.get_my_attention_registration_state()',
    'execute'
  )
union all
select 'attention_insert_workstation_trigger_exists',
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.customer_attentions'::regclass
      and tgname = 'customer_attentions_require_workstation'
      and not tgisinternal
  );
