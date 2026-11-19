-- Verificacion estructural de la etapa 1. No modifica datos.

do $verify$
begin
  if to_regprocedure('public.list_attention_filter_options()') is null then
    raise exception 'Falta list_attention_filter_options().';
  end if;
  if to_regprocedure('public.list_customer_attentions_v4(integer,integer,text,text,text,uuid,uuid,uuid,uuid)') is null then
    raise exception 'Falta list_customer_attentions_v4(...).';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public'
    and indexname = 'customer_attentions_created_by_created_at_idx') then
    raise exception 'Falta el indice por creador y fecha.';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public'
    and indexname = 'customer_attentions_channel_created_at_idx') then
    raise exception 'Falta el indice por medio y fecha.';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public'
    and indexname = 'attention_surveys_workstation_attention_idx') then
    raise exception 'Falta el indice por mesa y atencion.';
  end if;
end;
$verify$;
;

select
  has_function_privilege('anon', 'public.list_attention_filter_options()', 'EXECUTE')
    as anon_can_execute_filter_options,
  has_function_privilege('authenticated', 'public.list_attention_filter_options()', 'EXECUTE')
    as authenticated_can_execute_filter_options,
  has_function_privilege('anon',
    'public.list_customer_attentions_v4(integer,integer,text,text,text,uuid,uuid,uuid,uuid)', 'EXECUTE')
    as anon_can_execute_list,
  has_function_privilege('authenticated',
    'public.list_customer_attentions_v4(integer,integer,text,text,text,uuid,uuid,uuid,uuid)', 'EXECUTE')
    as authenticated_can_execute_list;

-- Resultado esperado: false, true, false, true.
