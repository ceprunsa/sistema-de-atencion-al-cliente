-- Verificacion no destructiva: correo grupal y aviso unico por derivacion.
select 'areas_group_email_column_exists' as test,
  exists (
    select 1
    from pg_attribute
    where attrelid = 'public.areas'::regclass
      and attname = 'group_email'
      and not attisdropped
  ) as passed
union all
select 'areas_group_email_constraint_exists',
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.areas'::regclass
      and conname = 'areas_group_email_check'
  )
union all
select 'areas_group_email_unique_index_exists',
  to_regclass('public.areas_group_email_lower_uidx') is not null
union all
select 'referral_group_email_guard_exists',
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.attention_referrals'::regclass
      and tgname = 'attention_referrals_require_group_email'
      and not tgisinternal
  )
union all
select 'referral_group_queue_function_exists',
  to_regprocedure('public.queue_referral_group_notification(uuid)') is not null
union all
select 'area_email_requeue_trigger_exists',
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.areas'::regclass
      and tgname = 'areas_requeue_pending_referrals'
      and not tgisinternal
  )
union all
select 'authenticated_cannot_queue_group_email_directly',
  not has_function_privilege(
    'authenticated',
    'public.queue_referral_group_notification(uuid)',
    'execute'
  );

-- Los correos grupales configurados deben estar normalizados y ser unicos.
select
  count(*) filter (
    where group_email is null
      or group_email !~ '^[^[:space:]@]+@cepr[.]unsa[.]pe$'
  ) as areas_pending_group_email,
  count(group_email) - count(distinct lower(btrim(group_email)))
    as duplicate_group_emails
from public.areas;

-- Ninguna derivacion creada con el mecanismo nuevo debe tener mas de un aviso
-- grupal activo o enviado para el mismo correo de destino.
select
  aggregate_id as referral_id,
  recipient_email,
  count(*) as duplicated_notifications
from public.email_outbox
where event_type = 'REFERRAL_CREATED'
  and template_data ->> 'recipientKind' = 'AREA_GROUP'
  and status in ('PENDING', 'PROCESSING', 'RETRY', 'SENT')
group by aggregate_id, recipient_email
having count(*) > 1;

