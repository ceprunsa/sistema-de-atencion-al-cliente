-- Etapa 3: avisos de nuevas derivaciones y contador por area.
-- Ejecutar despues de 06_dni_lookup_foundation.sql.

begin;

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
    insert into public.email_outbox (
      event_type, aggregate_type, aggregate_id, recipient_email,
      template_key, template_data, idempotency_key
    )
    select
      'REFERRAL_CREATED',
      'REFERRAL',
      new.id,
      recipients.email,
      'REFERRAL_CREATED',
      jsonb_build_object(
        'racCode', ca.rac_code,
        'attentionId', ca.id,
        'destinationAreaName', new.destination_area_name,
        'recipientProfileId', recipients.profile_id
      ),
      'referral-created:' || new.id::text || ':' ||
        new.destination_area_id::text || ':' || recipients.profile_id::text
    from public.customer_attentions ca
    cross join lateral (
      select ranked.profile_id, ranked.email
      from (
        select
          p.id as profile_id,
          lower(btrim(p.email)) as email,
          row_number() over (
            partition by lower(btrim(p.email))
            order by p.id
          ) as duplicate_number
        from public.profiles p
        where p.area_id = new.destination_area_id
          and p.status = 'active'
          and nullif(btrim(p.email), '') is not null
      ) ranked
      where ranked.duplicate_number = 1
    ) recipients
    where ca.id = new.attention_id
      and ca.status = 'ACTIVE'
    on conflict (idempotency_key) do nothing;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger attention_referrals_enqueue_notifications
after insert or update or delete on public.attention_referrals
for each row execute function public.enqueue_referral_created_notifications();

create or replace function public.get_pending_referral_count()
returns bigint
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_area_id uuid;
  v_count bigint;
begin
  if auth.uid() is null or public.is_active_tablet_session() then
    raise exception 'No tienes permiso para consultar el contador de derivaciones.';
  end if;

  select p.area_id
  into v_area_id
  from public.profiles p
  where p.id = auth.uid()
    and p.status = 'active';

  if not found then
    raise exception 'El usuario no tiene un perfil activo.';
  end if;

  if v_area_id is null then
    return 0;
  end if;

  select count(*)
  into v_count
  from public.attention_referrals ar
  join public.customer_attentions ca
    on ca.id = ar.attention_id
    and ca.status = 'ACTIVE'
  where ar.destination_area_id = v_area_id
    and ar.status = 'PENDING';

  return v_count;
end;
$$;

create or replace function public.broadcast_referral_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referral_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  if tg_op = 'DELETE'
    or (tg_op = 'UPDATE' and old.destination_area_id is distinct from new.destination_area_id) then
    perform realtime.send(
      jsonb_build_object('referralId', v_referral_id, 'action', lower(tg_op)),
      'referral_changed',
      'referrals:area:' || old.destination_area_id::text,
      true
    );
  end if;

  if tg_op <> 'DELETE'
    and new.destination_area_id is not null
    and (
      tg_op = 'INSERT'
      or new.destination_area_id is distinct from old.destination_area_id
      or new.status is distinct from old.status
    ) then
    perform realtime.send(
      jsonb_build_object(
        'referralId', v_referral_id,
        'action', lower(tg_op),
        'status', new.status
      ),
      'referral_changed',
      'referrals:area:' || new.destination_area_id::text,
      true
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
exception
  when undefined_function then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
end;
$$;

create trigger attention_referrals_broadcast_change
after insert or update or delete on public.attention_referrals
for each row execute function public.broadcast_referral_change();

drop policy if exists "area_users_receive_referral_broadcasts" on realtime.messages;
create policy "area_users_receive_referral_broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and not public.is_active_tablet_session()
  and realtime.topic() = 'referrals:area:' || coalesce((
    select p.area_id::text
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
  ), '')
);

revoke execute on function public.enqueue_referral_created_notifications()
  from public, anon, authenticated;
revoke execute on function public.broadcast_referral_change()
  from public, anon, authenticated;
revoke execute on function public.get_pending_referral_count()
  from public, anon;
grant execute on function public.get_pending_referral_count()
  to authenticated;

notify pgrst, 'reload schema';

commit;
