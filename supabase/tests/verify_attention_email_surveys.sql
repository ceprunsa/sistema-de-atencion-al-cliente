-- Verificación no destructiva de la etapa 4.
select 'recipient_email_column_exists' as test,
  exists (select 1 from pg_attribute where attrelid = 'public.attention_surveys'::regclass and attname = 'recipient_email' and not attisdropped) as passed
union all
select 'survey_token_column_exists',
  exists (select 1 from pg_attribute where attrelid = 'public.attention_surveys'::regclass and attname = 'survey_token' and not attisdropped)
union all
select 'rate_limit_table_exists',
  to_regclass('public.public_survey_rate_limits') is not null
union all
select 'queue_function_exists',
  to_regprocedure('public.queue_attention_email_survey(uuid,text)') is not null
union all
select 'public_read_function_exists',
  to_regprocedure('public.get_public_attention_survey(uuid)') is not null
union all
select 'public_response_function_exists',
  to_regprocedure('public.respond_public_attention_survey(uuid,text,boolean)') is not null
union all
select 'delivery_sync_trigger_exists',
  exists (select 1 from pg_trigger where tgrelid = 'public.email_outbox'::regclass and tgname = 'email_outbox_sync_attention_survey' and not tgisinternal)
union all
select 'authenticated_can_queue',
  has_function_privilege('authenticated', 'public.queue_attention_email_survey(uuid,text)', 'execute')
union all
select 'anon_cannot_queue',
  not has_function_privilege('anon', 'public.queue_attention_email_survey(uuid,text)', 'execute')
union all
select 'anon_cannot_read_token',
  not has_function_privilege('anon', 'public.get_public_attention_survey(uuid)', 'execute')
union all
select 'service_can_read_token',
  has_function_privilege('service_role', 'public.get_public_attention_survey(uuid)', 'execute');
