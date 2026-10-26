-- Etapa 1 de mejoras: correo grupal obligatorio por area y aviso unico de derivacion.
-- Compatible con areas historicas: la restriccion NOT VALID obliga a completar
-- el correo al crear o editar, sin impedir la instalacion antes del reinicio.

begin;

alter table public.areas
  add column if not exists group_email text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.areas'::regclass
      and conname = 'areas_group_email_check'
  ) then
    alter table public.areas
      add constraint areas_group_email_check check (
        group_email is not null
        and length(lower(btrim(group_email))) <= 254
        and lower(btrim(group_email)) ~ '^[^[:space:]@]+@cepr[.]unsa[.]pe$'
      ) not valid;
  end if;
end;
$$;

create unique index if not exists areas_group_email_lower_uidx
  on public.areas (lower(btrim(group_email)))
  where group_email is not null;

create or replace function public.normalize_area_group_email()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.group_email := lower(nullif(btrim(new.group_email), ''));
  return new;
end;
$$;

drop trigger if exists areas_normalize_group_email on public.areas;
create trigger areas_normalize_group_email
before insert or update of group_email on public.areas
for each row execute function public.normalize_area_group_email();

create or replace function public.require_referral_destination_group_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group_email text;
begin
  if new.status <> 'PENDING' then
    return new;
  end if;

  if new.destination_area_id is null then
    raise exception 'Selecciona un area de destino valida.';
  end if;

  select lower(btrim(a.group_email))
  into v_group_email
  from public.areas a
  where a.id = new.destination_area_id;

  if not found then
    raise exception 'El area de destino no existe.';
  end if;

  if v_group_email is null
    or length(v_group_email) > 254
    or v_group_email !~ '^[^[:space:]@]+@cepr[.]unsa[.]pe$' then
    raise exception 'El area de destino no tiene un correo de grupo @cepr.unsa.pe configurado.';
  end if;

  return new;
end;
$$;

drop trigger if exists attention_referrals_require_group_email
  on public.attention_referrals;
create trigger attention_referrals_require_group_email
before insert or update of destination_area_id on public.attention_referrals
for each row execute function public.require_referral_destination_group_email();

create or replace function public.queue_referral_group_notification(
  p_referral_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attention_id uuid;
  v_rac_code text;
  v_destination_area_id uuid;
  v_destination_area_name text;
  v_group_email text;
  v_referred_at timestamptz;
  v_idempotency_key text;
begin
  select
    ca.id,
    ca.rac_code,
    ar.destination_area_id,
    ar.destination_area_name,
    lower(btrim(a.group_email)),
    ar.referred_at
  into
    v_attention_id,
    v_rac_code,
    v_destination_area_id,
    v_destination_area_name,
    v_group_email,
    v_referred_at
  from public.attention_referrals ar
  join public.customer_attentions ca
    on ca.id = ar.attention_id
    and ca.status = 'ACTIVE'
  join public.areas a
    on a.id = ar.destination_area_id
  where ar.id = p_referral_id
    and ar.status = 'PENDING';

  if not found then
    return;
  end if;

  if v_group_email is null
    or length(v_group_email) > 254
    or v_group_email !~ '^[^[:space:]@]+@cepr[.]unsa[.]pe$' then
    raise exception 'El area de destino no tiene un correo de grupo @cepr.unsa.pe configurado.';
  end if;

  v_idempotency_key :=
    'referral-created-group:' || p_referral_id::text || ':' ||
    v_destination_area_id::text || ':' ||
    md5(v_group_email || ':' || v_referred_at::text);

  insert into public.email_outbox (
    event_type,
    aggregate_type,
    aggregate_id,
    recipient_email,
    template_key,
    template_data,
    idempotency_key
  ) values (
    'REFERRAL_CREATED',
    'REFERRAL',
    p_referral_id,
    v_group_email,
    'REFERRAL_CREATED',
    jsonb_build_object(
      'racCode', v_rac_code,
      'attentionId', v_attention_id,
      'destinationAreaName', v_destination_area_name,
      'destinationAreaId', v_destination_area_id,
      'recipientKind', 'AREA_GROUP'
    ),
    v_idempotency_key
  )
  on conflict (idempotency_key) do update
  set recipient_email = excluded.recipient_email,
      template_data = excluded.template_data,
      status = 'PENDING',
      next_attempt_at = now(),
      locked_at = null,
      locked_by = null,
      accepted_at = null,
      provider_message_id = null,
      last_error_code = null,
      last_error_message = null
  where email_outbox.status = 'FAILED_PERMANENT';
end;
$$;

create or replace function public.enqueue_referral_created_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_referral_id uuid;
  v_cancel_reason text;
begin
  if tg_op = 'DELETE' then
    v_referral_id := old.id;
    v_cancel_reason := 'La derivacion fue eliminada antes de entregar el aviso.';
  elsif tg_op = 'UPDATE'
    and (
      old.destination_area_id is distinct from new.destination_area_id
      or (old.status = 'PENDING' and new.status <> 'PENDING')
    ) then
    v_referral_id := new.id;
    v_cancel_reason := case
      when old.destination_area_id is distinct from new.destination_area_id
        then 'El area de destino cambio antes de entregar el aviso.'
      else 'La derivacion dejo de estar pendiente antes de entregar el aviso.'
    end;
  end if;

  if v_referral_id is not null then
    update public.email_outbox
    set status = 'FAILED_PERMANENT',
        locked_at = null,
        locked_by = null,
        accepted_at = null,
        last_error_code = 'REFERRAL_NO_LONGER_PENDING',
        last_error_message = v_cancel_reason
    where aggregate_type = 'REFERRAL'
      and aggregate_id = v_referral_id
      and event_type = 'REFERRAL_CREATED'
      and status in ('PENDING', 'RETRY', 'PROCESSING');
  end if;

  if tg_op <> 'DELETE'
    and new.status = 'PENDING'
    and (
      tg_op = 'INSERT'
      or old.destination_area_id is distinct from new.destination_area_id
    ) then
    perform public.queue_referral_group_notification(new.id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.requeue_pending_referrals_for_area_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_referral_id uuid;
begin
  if old.group_email is not distinct from new.group_email then
    return new;
  end if;

  update public.email_outbox eo
  set status = 'FAILED_PERMANENT',
      locked_at = null,
      locked_by = null,
      accepted_at = null,
      last_error_code = 'AREA_GROUP_EMAIL_CHANGED',
      last_error_message = 'El correo grupal del area cambio antes de entregar el aviso.'
  from public.attention_referrals ar
  where ar.destination_area_id = new.id
    and ar.status = 'PENDING'
    and eo.aggregate_type = 'REFERRAL'
    and eo.aggregate_id = ar.id
    and eo.event_type = 'REFERRAL_CREATED'
    and eo.status in ('PENDING', 'RETRY', 'PROCESSING');

  for v_referral_id in
    select ar.id
    from public.attention_referrals ar
    join public.customer_attentions ca
      on ca.id = ar.attention_id
      and ca.status = 'ACTIVE'
    where ar.destination_area_id = new.id
      and ar.status = 'PENDING'
      and not exists (
        select 1
        from public.email_outbox sent
        where sent.aggregate_type = 'REFERRAL'
          and sent.aggregate_id = ar.id
          and sent.event_type = 'REFERRAL_CREATED'
          and sent.status = 'SENT'
      )
  loop
    perform public.queue_referral_group_notification(v_referral_id);
  end loop;

  return new;
end;
$$;

drop trigger if exists areas_requeue_pending_referrals
  on public.areas;
create trigger areas_requeue_pending_referrals
after update of group_email on public.areas
for each row execute function public.requeue_pending_referrals_for_area_email();

-- Los avisos personales aun no enviados quedan reemplazados por el mecanismo grupal.
-- Los ya enviados se conservan como auditoria y no se reenvian.
update public.email_outbox
set status = 'FAILED_PERMANENT',
    locked_at = null,
    locked_by = null,
    accepted_at = null,
    last_error_code = 'SUPERSEDED_BY_AREA_GROUP',
    last_error_message = 'Aviso individual sustituido por el correo grupal del area.'
where event_type = 'REFERRAL_CREATED'
  and status in ('PENDING', 'RETRY', 'PROCESSING')
  and template_data ? 'recipientProfileId';

revoke execute on function public.normalize_area_group_email()
  from public, anon, authenticated;
revoke execute on function public.require_referral_destination_group_email()
  from public, anon, authenticated;
revoke execute on function public.queue_referral_group_notification(uuid)
  from public, anon, authenticated;
revoke execute on function public.enqueue_referral_created_notifications()
  from public, anon, authenticated;
revoke execute on function public.requeue_pending_referrals_for_area_email()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;

