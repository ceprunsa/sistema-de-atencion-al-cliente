-- Verificación no destructiva de la etapa 3.
select 'email_outbox_dependency_exists' as test,
  to_regclass('public.email_outbox') is not null as passed
union all
select 'pending_count_function_exists',
  to_regprocedure('public.get_pending_referral_count()') is not null
union all
select 'enqueue_trigger_exists',
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.attention_referrals'::regclass
      and tgname = 'attention_referrals_enqueue_notifications'
      and not tgisinternal
  )
union all
select 'broadcast_trigger_exists',
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.attention_referrals'::regclass
      and tgname = 'attention_referrals_broadcast_change'
      and not tgisinternal
  )
union all
select 'authenticated_can_read_own_count',
  has_function_privilege('authenticated', 'public.get_pending_referral_count()', 'execute')
union all
select 'anon_cannot_read_count',
  not has_function_privilege('anon', 'public.get_pending_referral_count()', 'execute')
union all
select 'authenticated_cannot_enqueue_directly',
  not has_function_privilege('authenticated', 'public.enqueue_referral_created_notifications()', 'execute')
union all
select 'area_realtime_policy_exists',
  exists (
    select 1 from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'area_users_receive_referral_broadcasts'
  );
