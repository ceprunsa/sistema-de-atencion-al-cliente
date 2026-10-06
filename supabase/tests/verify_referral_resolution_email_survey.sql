-- Verificación no destructiva de la etapa 5.
select 'referral_surveys_table_exists' as test,
  to_regclass('public.referral_surveys') is not null as passed
union all
select 'referral_survey_token_exists',
  exists (select 1 from pg_attribute where attrelid = 'public.referral_surveys'::regclass and attname = 'survey_token' and not attisdropped)
union all
select 'new_attention_signature_exists',
  to_regprocedure('public.create_customer_attention(jsonb,uuid,text,text,jsonb,text,uuid,uuid,text,text)') is not null
union all
select 'legacy_attention_signature_is_private',
  not has_function_privilege('authenticated', 'public.create_customer_attention_legacy(jsonb,uuid,text,text,jsonb,uuid,uuid,text,text)', 'execute')
union all
select 'referral_email_validation_trigger_exists',
  exists (select 1 from pg_trigger where tgrelid = 'public.attention_referrals'::regclass and tgname = 'attention_referrals_require_client_email' and not tgisinternal)
union all
select 'referral_delivery_sync_trigger_exists',
  exists (select 1 from pg_trigger where tgrelid = 'public.email_outbox'::regclass and tgname = 'email_outbox_sync_referral_survey' and not tgisinternal)
union all
select 'public_referral_read_exists',
  to_regprocedure('public.get_public_referral_survey(uuid)') is not null
union all
select 'public_referral_response_exists',
  to_regprocedure('public.respond_public_referral_survey(uuid,text,boolean)') is not null
union all
select 'anon_cannot_read_referral_token',
  not has_function_privilege('anon', 'public.get_public_referral_survey(uuid)', 'execute')
union all
select 'service_can_read_referral_token',
  has_function_privilege('service_role', 'public.get_public_referral_survey(uuid)', 'execute')
union all
select 'authenticated_can_conclude',
  has_function_privilege('authenticated', 'public.conclude_attention_referral(uuid,text)', 'execute')
union all
select 'referral_survey_policy_exists',
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'referral_surveys' and policyname = 'referral_surveys_select_authorized');
