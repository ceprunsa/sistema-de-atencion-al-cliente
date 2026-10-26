-- Verificacion no destructiva: categorias de medios y clientes flexibles.
select 'service_channel_category_exists' as test,
  exists (
    select 1 from pg_attribute
    where attrelid = 'public.service_channels'::regclass
      and attname = 'category' and not attisdropped
  ) as passed
union all
select 'client_display_name_exists',
  exists (
    select 1 from pg_attribute
    where attrelid = 'public.clients'::regclass
      and attname = 'display_name' and attnotnull and not attisdropped
  )
union all
select 'client_dni_is_optional',
  exists (
    select 1 from pg_attribute
    where attrelid = 'public.clients'::regclass
      and attname = 'dni' and not attnotnull and not attisdropped
  )
union all
select 'client_email_lookup_index_exists',
  to_regclass('public.clients_email_lower_idx') is not null
union all
select 'used_channel_category_guard_exists',
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.service_channels'::regclass
      and tgname = 'service_channels_preserve_used_category'
      and not tgisinternal
  )
union all
select 'create_attention_v2_exists',
  to_regprocedure('public.create_customer_attention_v2(jsonb,uuid,text,text,jsonb,text,uuid,uuid,text,text)') is not null
union all
select 'update_attention_v2_exists',
  to_regprocedure('public.update_customer_attention_v2(uuid,jsonb,uuid,text,text,jsonb,uuid,uuid,text,text)') is not null
union all
select 'create_attention_v2_authenticated_execute',
  has_function_privilege(
    'authenticated',
    'public.create_customer_attention_v2(jsonb,uuid,text,text,jsonb,text,uuid,uuid,text,text)',
    'execute'
  )
union all
select 'create_attention_v2_anon_denied',
  not has_function_privilege(
    'anon',
    'public.create_customer_attention_v2(jsonb,uuid,text,text,jsonb,text,uuid,uuid,text,text)',
    'execute'
  );

-- Antes de operar, este resultado debe ser cero. Los medios antiguos deben
-- clasificarse desde Administracion > Medios de atencion.
select count(*) as active_channels_pending_category
from public.service_channels
where is_active and category is null;
