-- Etapa 4: encuesta de satisfaccion de la atencion por correo.
-- Ejecutar despues de 07_referral_notifications_badge.sql.

begin;

drop index if exists public.attention_surveys_open_workstation_uidx;
alter table public.attention_surveys
  drop constraint if exists attention_surveys_channel_check,
  drop constraint if exists attention_surveys_status_check,
  drop constraint if exists attention_surveys_check;

alter table public.attention_surveys
  add column recipient_email text,
  add column survey_token uuid unique,
  add column token_expires_at timestamptz,
  add column email_outbox_id uuid unique references public.email_outbox(id) on delete restrict;

update public.attention_surveys
set channel = 'UNDECIDED'
where status = 'PENDING_DECISION';

alter table public.attention_surveys
  alter column channel set default 'UNDECIDED',
  add constraint attention_surveys_channel_check
    check (channel in ('UNDECIDED', 'TABLET', 'EMAIL')),
  add constraint attention_surveys_status_check
    check (status in ('PENDING_DECISION', 'QUEUED', 'SENT', 'COMPLETED', 'SKIPPED', 'CANCELLED')),
  add constraint attention_surveys_state_check check (
    (status = 'PENDING_DECISION' and channel = 'UNDECIDED'
      and response is null and sent_at is null and completed_at is null and closed_at is null)
    or (status = 'QUEUED' and channel = 'EMAIL'
      and response is null and sent_at is null and completed_at is null and closed_at is null
      and nullif(btrim(recipient_email), '') is not null
      and survey_token is not null and token_expires_at is null and email_outbox_id is not null)
    or (status = 'SENT' and response is null and sent_at is not null
      and completed_at is null and closed_at is null
      and (
        (channel = 'TABLET' and recipient_email is null and survey_token is null
          and token_expires_at is null and email_outbox_id is null)
        or (channel = 'EMAIL' and sent_binding_id is null
          and nullif(btrim(recipient_email), '') is not null
          and survey_token is not null and token_expires_at is not null
          and email_outbox_id is not null)
      ))
    or (status = 'COMPLETED' and response is not null and sent_at is not null
      and completed_at is not null and closed_at is null
      and channel in ('TABLET', 'EMAIL'))
    or (status in ('SKIPPED', 'CANCELLED') and response is null
      and completed_at is null and closed_at is not null
      and nullif(btrim(closed_reason), '') is not null)
  );

create unique index attention_surveys_open_workstation_uidx
  on public.attention_surveys (workstation_id)
  where status = 'PENDING_DECISION' or (channel = 'TABLET' and status = 'SENT');

create table public.public_survey_rate_limits (
  scope_type text not null check (scope_type in ('ORIGIN', 'TOKEN')),
  scope_key text not null check (scope_key ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (scope_type, scope_key, window_started_at)
);

create index public_survey_rate_limits_window_idx
  on public.public_survey_rate_limits (window_started_at);

create or replace function public.consume_public_survey_rate_limit(
  p_origin_hash text,
  p_token_hash text
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window timestamptz := date_trunc('minute', clock_timestamp());
  v_origin_count integer;
  v_token_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Operacion reservada al servicio publico de encuestas.';
  end if;
  if p_origin_hash !~ '^[0-9a-f]{64}$' or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Los datos del limite no son validos.';
  end if;

  delete from public.public_survey_rate_limits
  where window_started_at < v_window - interval '1 day';

  insert into public.public_survey_rate_limits as limits
    (scope_type, scope_key, window_started_at, request_count)
  values ('ORIGIN', p_origin_hash, v_window, 1)
  on conflict (scope_type, scope_key, window_started_at) do update
    set request_count = limits.request_count + 1, updated_at = now()
  returning request_count into v_origin_count;

  insert into public.public_survey_rate_limits as limits
    (scope_type, scope_key, window_started_at, request_count)
  values ('TOKEN', p_token_hash, v_window, 1)
  on conflict (scope_type, scope_key, window_started_at) do update
    set request_count = limits.request_count + 1, updated_at = now()
  returning request_count into v_token_count;

  return query select
    v_origin_count <= 30 and v_token_count <= 10,
    greatest(1, ceil(extract(epoch from (
      v_window + interval '1 minute' - clock_timestamp()
    )))::integer);
end;
$$;

create or replace function public.queue_attention_email_survey(
  p_attention_id uuid,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_survey public.attention_surveys%rowtype;
  v_client_id uuid;
  v_email text;
  v_rac_code text;
  v_token uuid := gen_random_uuid();
  v_outbox_id uuid;
begin
  if auth.uid() is null or public.is_active_tablet_session() then
    raise exception 'No hay una sesion de usuario valida.';
  end if;

  select s.* into v_survey
  from public.attention_surveys s
  join public.customer_attentions ca
    on ca.id = s.attention_id and ca.status = 'ACTIVE'
  where s.attention_id = p_attention_id
    and s.requested_by = auth.uid()
  for update of s;

  if not found then
    raise exception 'La encuesta no existe o no te pertenece.';
  end if;
  select ca.client_id, ca.rac_code into v_client_id, v_rac_code
  from public.customer_attentions ca where ca.id = v_survey.attention_id;
  if v_survey.status <> 'PENDING_DECISION' then
    raise exception 'La encuesta ya fue enviada o cerrada.';
  end if;

  select lower(btrim(coalesce(nullif(p_email, ''), c.email)))
  into v_email
  from public.clients c
  where c.id = v_client_id
  for update;

  if v_email is null
    or length(v_email) > 254
    or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$' then
    raise exception 'Registra un correo electronico valido para enviar la encuesta.';
  end if;

  update public.clients set email = v_email where id = v_client_id;

  insert into public.email_outbox (
    event_type, aggregate_type, aggregate_id, recipient_email,
    template_key, template_data, idempotency_key
  ) values (
    'ATTENTION_SURVEY', 'ATTENTION', p_attention_id, v_email,
    'ATTENTION_SURVEY',
    jsonb_build_object(
      'racCode', v_rac_code,
      'surveyToken', v_token::text,
      'surveyId', v_survey.id
    ),
    'attention-survey:' || v_survey.id::text
  )
  returning id into v_outbox_id;

  update public.attention_surveys
  set channel = 'EMAIL',
      status = 'QUEUED',
      recipient_email = v_email,
      survey_token = v_token,
      email_outbox_id = v_outbox_id,
      sent_binding_id = null
  where id = v_survey.id;

  return jsonb_build_object(
    'status', 'QUEUED',
    'channel', 'EMAIL',
    'recipientEmail', v_email
  );
end;
$$;

create or replace function public.get_attention_survey_state(p_attention_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'status', s.status,
    'channel', s.channel,
    'recipientEmail', s.recipient_email,
    'expiresAt', s.token_expires_at
  )
  from public.attention_surveys s
  where s.attention_id = p_attention_id
    and (s.requested_by = auth.uid() or public.is_admin())
    and not public.is_active_tablet_session()
$$;

create or replace function public.get_public_attention_survey(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_survey public.attention_surveys%rowtype;
  v_rac_code text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Operacion reservada al servicio publico de encuestas.';
  end if;

  select s.* into v_survey
  from public.attention_surveys s
  join public.customer_attentions ca
    on ca.id = s.attention_id and ca.status = 'ACTIVE'
  where s.survey_token = p_token
    and s.channel = 'EMAIL'
  for update of s;

  if not found then
    return jsonb_build_object('state', 'INVALID');
  end if;
  select ca.rac_code into v_rac_code
  from public.customer_attentions ca where ca.id = v_survey.attention_id;

  if v_survey.status = 'SENT' and v_survey.token_expires_at <= now() then
    update public.attention_surveys
    set status = 'CANCELLED',
        closed_by_name = 'Sistema',
        closed_at = now(),
        closed_reason = 'La invitacion por correo vencio sin respuesta'
    where id = v_survey.id and status = 'SENT';
    return jsonb_build_object('state', 'EXPIRED');
  end if;

  if v_survey.status = 'SENT' then
    return jsonb_build_object(
      'state', 'OPEN',
      'racCode', v_rac_code,
      'expiresAt', v_survey.token_expires_at
    );
  end if;
  if v_survey.status = 'QUEUED' then
    return jsonb_build_object('state', 'PENDING_DELIVERY');
  end if;
  if v_survey.status = 'CANCELLED'
    and v_survey.closed_reason = 'La invitacion por correo vencio sin respuesta' then
    return jsonb_build_object('state', 'EXPIRED');
  end if;
  return jsonb_build_object('state', 'CLOSED');
end;
$$;

create or replace function public.respond_public_attention_survey(
  p_token uuid,
  p_response text default null,
  p_skip boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_survey public.attention_surveys%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Operacion reservada al servicio publico de encuestas.';
  end if;
  if not p_skip and p_response not in (
    'VERY_SATISFIED', 'SATISFIED', 'DISSATISFIED', 'VERY_DISSATISFIED'
  ) then
    return jsonb_build_object('result', 'INVALID_RESPONSE');
  end if;

  select s.* into v_survey
  from public.attention_surveys s
  join public.customer_attentions ca
    on ca.id = s.attention_id and ca.status = 'ACTIVE'
  where s.survey_token = p_token and s.channel = 'EMAIL'
  for update of s;

  if not found then
    return jsonb_build_object('result', 'INVALID');
  end if;
  if v_survey.status = 'SENT' and v_survey.token_expires_at <= now() then
    update public.attention_surveys
    set status = 'CANCELLED', closed_by_name = 'Sistema', closed_at = now(),
        closed_reason = 'La invitacion por correo vencio sin respuesta'
    where id = v_survey.id;
    return jsonb_build_object('result', 'EXPIRED');
  end if;
  if v_survey.status <> 'SENT' then
    return jsonb_build_object('result', 'CLOSED');
  end if;

  if p_skip then
    update public.attention_surveys
    set status = 'SKIPPED', closed_by_name = 'Cliente por correo',
        closed_at = now(), closed_reason = 'Omitida por el cliente desde el enlace de correo'
    where id = v_survey.id and status = 'SENT';
    return jsonb_build_object('result', 'SKIPPED');
  end if;

  update public.attention_surveys
  set status = 'COMPLETED', response = p_response, completed_at = now()
  where id = v_survey.id and status = 'SENT';
  return jsonb_build_object('result', 'COMPLETED');
end;
$$;

create or replace function public.sync_attention_email_delivery()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.event_type <> 'ATTENTION_SURVEY'
    or new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'SENT' then
    update public.attention_surveys
    set status = 'SENT',
        sent_at = new.accepted_at,
        token_expires_at = new.accepted_at + interval '3 days'
    where email_outbox_id = new.id
      and channel = 'EMAIL'
      and status = 'QUEUED';
  elsif new.status = 'FAILED_PERMANENT' then
    update public.attention_surveys
    set status = 'CANCELLED',
        closed_by_name = 'Sistema',
        closed_at = now(),
        closed_reason = 'No se pudo enviar la encuesta por correo: ' ||
          coalesce(new.last_error_code, 'ERROR_DE_ENVIO')
    where email_outbox_id = new.id
      and channel = 'EMAIL'
      and status = 'QUEUED';
  end if;
  return new;
end;
$$;

create trigger email_outbox_sync_attention_survey
after update of status on public.email_outbox
for each row execute function public.sync_attention_email_delivery();

create or replace function public.cancel_attention_email_delivery()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.channel = 'EMAIL'
    and old.status = 'QUEUED'
    and new.status in ('SKIPPED', 'CANCELLED') then
    update public.email_outbox
    set status = 'FAILED_PERMANENT',
        locked_at = null,
        locked_by = null,
        accepted_at = null,
        last_error_code = 'SURVEY_NO_LONGER_PENDING',
        last_error_message = 'La encuesta fue cerrada antes de entregar el correo.'
    where id = old.email_outbox_id
      and status in ('PENDING', 'RETRY', 'PROCESSING');
  end if;
  return new;
end;
$$;

create trigger attention_surveys_cancel_email_delivery
after update of status on public.attention_surveys
for each row execute function public.cancel_attention_email_delivery();

create or replace function public.require_attention_workstation()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_workstation_id uuid;
begin
  if public.is_active_tablet_session() then
    raise exception 'Una sesion de tablet no puede registrar atenciones.';
  end if;
  select public.active_workstation_for_user(new.created_by) into v_workstation_id;
  if v_workstation_id is null then
    raise exception 'Debes tener una mesa de trabajo activa para registrar atenciones.';
  end if;
  perform 1 from public.workstations w where w.id = v_workstation_id for update;
  if exists (
    select 1 from public.attention_surveys s
    where s.workstation_id = v_workstation_id
      and (s.status = 'PENDING_DECISION' or (s.channel = 'TABLET' and s.status = 'SENT'))
  ) then
    raise exception 'Debes completar u omitir la encuesta pendiente antes de registrar otra atencion.';
  end if;
  return new;
end;
$$;

create or replace function public.guard_workstation_deactivation()
returns trigger language plpgsql set search_path = public
as $$
begin
  if old.is_active and not new.is_active and (
    exists (select 1 from public.workstation_assignments wa where wa.workstation_id = old.id and wa.ended_at is null)
    or exists (select 1 from public.tablet_bindings tb where tb.workstation_id = old.id and tb.deactivated_at is null)
    or exists (
      select 1 from public.attention_surveys s
      where s.workstation_id = old.id
        and (s.status = 'PENDING_DECISION' or (s.channel = 'TABLET' and s.status = 'SENT'))
    )
  ) then
    raise exception 'Libera la asignacion, la tablet y la encuesta pendiente antes de inhabilitar la mesa.';
  end if;
  return new;
end;
$$;

create or replace function public.unassign_workstation(p_workstation_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_actor text := public.admin_actor_name();
begin
  if nullif(btrim(p_reason), '') is null then raise exception 'El motivo es obligatorio.'; end if;
  if exists (
    select 1 from public.attention_surveys s
    where s.workstation_id = p_workstation_id
      and (s.status = 'PENDING_DECISION' or (s.channel = 'TABLET' and s.status = 'SENT'))
  ) then raise exception 'No se puede liberar una mesa con una encuesta presencial pendiente.'; end if;
  update public.tablet_bindings set deactivated_at = now(), deactivated_by = auth.uid(),
    deactivated_by_name = v_actor, deactivation_reason = btrim(p_reason)
  where workstation_id = p_workstation_id and deactivated_at is null;
  update public.workstation_assignments set ended_at = now(), ended_by = auth.uid(),
    ended_by_name = v_actor
  where workstation_id = p_workstation_id and ended_at is null;
  if not found then raise exception 'La mesa no tiene una asignacion activa.'; end if;
end;
$$;

create or replace function public.send_attention_survey(p_attention_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_survey public.attention_surveys%rowtype; v_binding_id uuid;
begin
  if public.is_active_tablet_session() then raise exception 'Operacion no permitida desde la tablet.'; end if;
  select s.* into v_survey from public.attention_surveys s
  join public.customer_attentions ca on ca.id = s.attention_id and ca.status = 'ACTIVE'
  where s.attention_id = p_attention_id and s.requested_by = auth.uid() for update of s;
  if not found then raise exception 'La encuesta no existe o no te pertenece.'; end if;
  if v_survey.status <> 'PENDING_DECISION' then raise exception 'La encuesta ya fue enviada o cerrada.'; end if;
  select tb.id into v_binding_id from public.tablet_bindings tb
  where tb.workstation_id = v_survey.workstation_id and tb.user_id = auth.uid()
    and tb.deactivated_at is null;
  if v_binding_id is null then raise exception 'No tienes una tablet activa vinculada a esta mesa.'; end if;
  update public.attention_surveys
  set channel = 'TABLET', status = 'SENT', sent_binding_id = v_binding_id, sent_at = now()
  where id = v_survey.id and status = 'PENDING_DECISION';
end;
$$;

create or replace function public.get_current_operator_survey()
returns jsonb language sql security definer stable set search_path = public
as $$
  select jsonb_build_object(
    'attentionId', ca.id, 'racCode', ca.rac_code,
    'status', s.status, 'channel', s.channel
  )
  from public.attention_surveys s
  join public.customer_attentions ca on ca.id = s.attention_id
  where s.requested_by = auth.uid()
    and (s.status = 'PENDING_DECISION' or (s.channel = 'TABLET' and s.status = 'SENT'))
    and not public.is_active_tablet_session()
  order by s.created_at desc limit 1
$$;

create or replace function public.get_current_tablet_survey()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_result jsonb;
begin
  update public.tablet_bindings set last_seen_at = now()
  where user_id = auth.uid() and session_id = public.current_session_id() and deactivated_at is null;
  select jsonb_build_object('id', s.id, 'status', s.status, 'sentAt', s.sent_at)
  into v_result
  from public.attention_surveys s
  join public.tablet_bindings tb on tb.workstation_id = s.workstation_id
    and tb.user_id = auth.uid() and tb.session_id = public.current_session_id()
    and tb.deactivated_at is null
  where s.status = 'SENT' and s.channel = 'TABLET'
  order by s.sent_at limit 1;
  return v_result;
end;
$$;

create or replace function public.answer_tablet_survey(p_survey_id uuid, p_response text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if p_response not in ('VERY_SATISFIED', 'SATISFIED', 'DISSATISFIED', 'VERY_DISSATISFIED') then
    raise exception 'La respuesta seleccionada no es valida.';
  end if;
  update public.attention_surveys s set status = 'COMPLETED', response = p_response, completed_at = now()
  from public.tablet_bindings tb
  where s.id = p_survey_id and s.status = 'SENT' and s.channel = 'TABLET'
    and tb.workstation_id = s.workstation_id and tb.user_id = auth.uid()
    and tb.session_id = public.current_session_id() and tb.deactivated_at is null;
  if not found then raise exception 'La encuesta ya fue cerrada o no pertenece a esta tablet.'; end if;
end;
$$;

create or replace function public.skip_tablet_survey(p_survey_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.attention_surveys s set status = 'SKIPPED', closed_by = auth.uid(),
    closed_by_name = 'Cliente en tablet', closed_at = now(), closed_reason = 'Omitida desde la tablet'
  from public.tablet_bindings tb
  where s.id = p_survey_id and s.status = 'SENT' and s.channel = 'TABLET'
    and tb.workstation_id = s.workstation_id and tb.user_id = auth.uid()
    and tb.session_id = public.current_session_id() and tb.deactivated_at is null;
  if not found then raise exception 'La encuesta ya fue cerrada o no pertenece a esta tablet.'; end if;
end;
$$;

create or replace function public.broadcast_attention_survey_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('surveyId', new.id, 'status', new.status, 'channel', new.channel),
    'survey_changed', 'workstation:' || new.workstation_id::text, true
  );
  perform realtime.send(
    jsonb_build_object('surveyId', new.id, 'status', new.status, 'channel', new.channel),
    'survey_changed', 'operator:' || new.requested_by::text, true
  );
  return new;
exception when undefined_function then
  return new;
end;
$$;

create or replace function public.close_attention_children()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if old.status = 'ACTIVE' and new.status = 'DISABLED' then
    update public.attention_surveys
    set status = 'CANCELLED', closed_by = new.disabled_by,
        closed_by_name = coalesce(new.disabled_by_name, 'Sistema'), closed_at = now(),
        closed_reason = 'Atencion inhabilitada: ' || coalesce(new.disabled_reason, 'Sin motivo')
    where attention_id = new.id and status in ('PENDING_DECISION', 'QUEUED', 'SENT');
    update public.attention_referrals
    set status = 'CANCELLED', cancelled_by = new.disabled_by,
        cancelled_by_name = coalesce(new.disabled_by_name, 'Sistema'), cancelled_at = now(),
        cancelled_reason = 'Atencion inhabilitada: ' || coalesce(new.disabled_reason, 'Sin motivo')
    where attention_id = new.id and status = 'PENDING';
  end if;
  return new;
end;
$$;

create or replace function public.close_deleted_user_surveys()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_name text := concat_ws(' ', old.first_name, nullif(old.middle_name, ''), old.paternal_surname, old.maternal_surname);
begin
  update public.attention_surveys set status = 'CANCELLED', closed_by = old.id,
    closed_by_name = v_name, closed_at = now(), closed_reason = 'Usuario responsable eliminado'
  where requested_by = old.id and status in ('PENDING_DECISION', 'QUEUED', 'SENT');
  return old;
end;
$$;

alter table public.public_survey_rate_limits enable row level security;
revoke all on public.public_survey_rate_limits from public, anon, authenticated;
revoke execute on function public.consume_public_survey_rate_limit(text, text)
  from public, anon, authenticated;
revoke execute on function public.get_public_attention_survey(uuid)
  from public, anon, authenticated;
revoke execute on function public.respond_public_attention_survey(uuid, text, boolean)
  from public, anon, authenticated;
revoke execute on function public.queue_attention_email_survey(uuid, text)
  from public, anon;
revoke execute on function public.get_attention_survey_state(uuid)
  from public, anon;
revoke execute on function public.sync_attention_email_delivery()
  from public, anon, authenticated;
revoke execute on function public.cancel_attention_email_delivery()
  from public, anon, authenticated;

grant select, insert, update, delete on public.public_survey_rate_limits to service_role;
grant execute on function public.consume_public_survey_rate_limit(text, text) to service_role;
grant execute on function public.get_public_attention_survey(uuid) to service_role;
grant execute on function public.respond_public_attention_survey(uuid, text, boolean) to service_role;
grant execute on function public.queue_attention_email_survey(uuid, text) to authenticated;
grant execute on function public.get_attention_survey_state(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
