-- Verificacion no destructiva: intercambio Gmail respondido (version 2).
with expected_columns(column_name) as (
  values
    ('gmail_import_version'),
    ('email_response_original_text'),
    ('email_response_mailbox_email'),
    ('email_response_mailbox_name'),
    ('email_response_delegate_email'),
    ('email_response_is_delegated'),
    ('email_received_at_source'),
    ('email_responded_at_source'),
    ('gmail_conversation_url'),
    ('source_response_message_key_hash'),
    ('source_exchange_fingerprint')
)
select 'all_exchange_columns_exist' as test,
  not exists (
    select 1
    from expected_columns ec
    where not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'customer_attentions'
        and c.column_name = ec.column_name
    )
  ) as passed
union all
select 'response_message_key_index_exists',
  to_regclass('public.customer_attentions_source_response_message_key_hash_idx') is not null
union all
select 'exchange_fingerprint_index_exists',
  to_regclass('public.customer_attentions_source_exchange_fingerprint_idx') is not null
union all
select 'delegate_name_column_removed',
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customer_attentions'
      and column_name = 'email_response_delegate_name'
  )
union all
select 'create_attention_v6_exists',
  to_regprocedure(
    'public.create_customer_attention_v6(jsonb,uuid,text,text,jsonb,text,jsonb,uuid,uuid,text,text,text,timestamptz,timestamptz,text,jsonb,text,text,smallint,text,text,text,text,boolean,text,text,text,text,text)'
  ) is not null
union all
select 'exchange_duplicate_lookup_exists',
  to_regprocedure('public.find_email_exchange_duplicates(text,text,text)') is not null
union all
select 'create_attention_v6_authenticated_execute',
  has_function_privilege(
    'authenticated',
    'public.create_customer_attention_v6(jsonb,uuid,text,text,jsonb,text,jsonb,uuid,uuid,text,text,text,timestamptz,timestamptz,text,jsonb,text,text,smallint,text,text,text,text,boolean,text,text,text,text,text)',
    'execute'
  )
union all
select 'create_attention_v6_anon_denied',
  not has_function_privilege(
    'anon',
    'public.create_customer_attention_v6(jsonb,uuid,text,text,jsonb,text,jsonb,uuid,uuid,text,text,text,timestamptz,timestamptz,text,jsonb,text,text,smallint,text,text,text,text,boolean,text,text,text,text,text)',
    'execute'
  )
union all
select 'exchange_lookup_authenticated_execute',
  has_function_privilege(
    'authenticated',
    'public.find_email_exchange_duplicates(text,text,text)',
    'execute'
  )
union all
select 'exchange_lookup_anon_denied',
  not has_function_privilege(
    'anon',
    'public.find_email_exchange_duplicates(text,text,text)',
    'execute'
  )
union all
select 'gmail_v2_constraint_exists',
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.customer_attentions'::regclass
      and conname = 'customer_attentions_exchange_metadata_origin_check'
  );

