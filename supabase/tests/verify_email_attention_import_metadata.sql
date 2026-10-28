-- Verificacion no destructiva: metadatos de correo e importacion Gmail.
select 'creation_origin_column_exists' as test,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_attentions'
      and column_name = 'creation_origin'
  ) as passed
union all
select 'email_received_at_column_exists',
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_attentions'
      and column_name = 'email_received_at'
  )
union all
select 'email_responded_at_column_exists',
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_attentions'
      and column_name = 'email_responded_at'
  )
union all
select 'email_original_text_column_exists',
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_attentions'
      and column_name = 'email_original_text'
  )
union all
select 'email_attachments_column_exists',
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_attentions'
      and column_name = 'email_attachments'
  )
union all
select 'message_key_index_exists',
  to_regclass('public.customer_attentions_source_message_key_hash_idx') is not null
union all
select 'fingerprint_index_exists',
  to_regclass('public.customer_attentions_source_fingerprint_idx') is not null
union all
select 'attachment_validator_accepts_valid_array',
  public.is_valid_email_attachment_metadata(
    '[{"name":"documento.pdf","sizeLabel":"120 KB","typeLabel":"PDF"}]'::jsonb
  )
union all
select 'attachment_validator_rejects_unknown_fields',
  not public.is_valid_email_attachment_metadata(
    '[{"name":"documento.pdf","downloadUrl":"https://example.invalid"}]'::jsonb
  )
union all
select 'create_attention_v4_exists',
  to_regprocedure(
    'public.create_customer_attention_v4(jsonb,uuid,text,text,jsonb,text,jsonb,uuid,uuid,text,text,text,timestamptz,timestamptz,text,jsonb,text,text)'
  ) is not null
union all
select 'update_attention_v4_exists',
  to_regprocedure(
    'public.update_customer_attention_v4(uuid,jsonb,uuid,text,text,jsonb,jsonb,uuid,uuid,text,text,timestamptz,timestamptz)'
  ) is not null
union all
select 'limited_response_rpc_exists',
  to_regprocedure('public.set_email_attention_response_at(uuid,timestamptz)') is not null
union all
select 'duplicate_lookup_rpc_exists',
  to_regprocedure('public.find_email_attention_duplicates(text,text)') is not null
union all
select 'create_attention_v4_authenticated_execute',
  has_function_privilege(
    'authenticated',
    'public.create_customer_attention_v4(jsonb,uuid,text,text,jsonb,text,jsonb,uuid,uuid,text,text,text,timestamptz,timestamptz,text,jsonb,text,text)',
    'execute'
  )
union all
select 'create_attention_v4_anon_denied',
  not has_function_privilege(
    'anon',
    'public.create_customer_attention_v4(jsonb,uuid,text,text,jsonb,text,jsonb,uuid,uuid,text,text,text,timestamptz,timestamptz,text,jsonb,text,text)',
    'execute'
  )
union all
select 'response_rpc_authenticated_execute',
  has_function_privilege(
    'authenticated',
    'public.set_email_attention_response_at(uuid,timestamptz)',
    'execute'
  )
union all
select 'response_rpc_anon_denied',
  not has_function_privilege(
    'anon',
    'public.set_email_attention_response_at(uuid,timestamptz)',
    'execute'
  )
union all
select 'duplicate_lookup_authenticated_execute',
  has_function_privilege(
    'authenticated',
    'public.find_email_attention_duplicates(text,text)',
    'execute'
  )
union all
select 'duplicate_lookup_anon_denied',
  not has_function_privilege(
    'anon',
    'public.find_email_attention_duplicates(text,text)',
    'execute'
  );
