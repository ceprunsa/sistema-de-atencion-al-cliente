-- Etapa 5: correo de resultado y encuesta independiente de la derivacion.
-- Ejecutar despues de 08_attention_email_surveys.sql.

begin;

create table public.referral_surveys (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null unique references public.attention_referrals(id) on delete cascade,
  status text not null check (status in ('QUEUED', 'SENT', 'COMPLETED', 'SKIPPED', 'CANCELLED')),
  response text check (response in ('VERY_SATISFIED', 'SATISFIED', 'DISSATISFIED', 'VERY_DISSATISFIED')),
  recipient_email text,
  survey_token uuid unique,
  token_expires_at timestamptz,
  email_outbox_id uuid unique references public.email_outbox(id) on delete restrict,
  sent_at timestamptz,
  completed_at timestamptz,
  closed_at timestamptz,
  closed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referral_surveys_state_check check (
    (status = 'QUEUED' and response is null and sent_at is null
      and completed_at is null and closed_at is null
      and nullif(btrim(recipient_email), '') is not null
      and survey_token is not null and token_expires_at is null
      and email_outbox_id is not null)
    or (status = 'SENT' and response is null and sent_at is not null
      and completed_at is null and closed_at is null
      and nullif(btrim(recipient_email), '') is not null
      and survey_token is not null and token_expires_at is not null
      and email_outbox_id is not null)
    or (status = 'COMPLETED' and response is not null and sent_at is not null
      and completed_at is not null and closed_at is null)
    or (status in ('SKIPPED', 'CANCELLED') and response is null
      and completed_at is null and closed_at is not null
      and nullif(btrim(closed_reason), '') is not null)
  )
);

create index referral_surveys_status_idx on public.referral_surveys (status);
create trigger referral_surveys_set_updated_at
before update on public.referral_surveys
for each row execute function public.set_updated_at();

create or replace function public.require_referral_client_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
begin
  select lower(btrim(c.email)) into v_email
  from public.customer_attentions ca
  join public.clients c on c.id = ca.client_id
  where ca.id = new.attention_id
    and ca.status = 'ACTIVE';

  if not found then
    raise exception 'La atencion no existe o esta inhabilitada.';
  end if;
  if v_email is null
    or length(v_email) > 254
    or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$' then
    raise exception 'Registra un correo electronico valido para crear la derivacion.';
  end if;
  return new;
end;
$$;

create trigger attention_referrals_require_client_email
before insert or update of destination_area_id on public.attention_referrals
for each row execute function public.require_referral_client_email();

create or replace function public.prevent_pending_referral_email_loss()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.customer_attentions ca
    join public.attention_referrals ar on ar.attention_id = ca.id
    where ca.client_id = new.id
      and ca.status = 'ACTIVE'
      and ar.status = 'PENDING'
  ) and (
    nullif(btrim(new.email), '') is null
    or length(lower(btrim(new.email))) > 254
    or lower(btrim(new.email)) !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$'
  ) then
    raise exception 'El cliente debe conservar un correo valido mientras tenga una derivacion pendiente.';
  end if;
  return new;
end;
$$;

create trigger clients_preserve_pending_referral_email
before update of email on public.clients
for each row execute function public.prevent_pending_referral_email_loss();

-- Conserva la implementacion previa como detalle interno y publica una firma
-- que permite actualizar el correo de un cliente ya existente.
alter function public.create_customer_attention(
  jsonb, uuid, text, text, jsonb, uuid, uuid, text, text
) rename to create_customer_attention_legacy;

create or replace function public.create_customer_attention(
  p_client jsonb,
  p_service_channel_id uuid,
  p_requester_type text,
  p_conclusion text,
  p_topics jsonb,
  p_client_contact_email text,
  p_kinship_type_id uuid default null,
  p_destination_area_id uuid default null,
  p_requester_detail text default null,
  p_kinship_detail text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(nullif(btrim(p_client_contact_email), ''));
  v_client jsonb := p_client;
  v_result jsonb;
  v_dni text := btrim(p_client ->> 'dni');
begin
  if auth.uid() is null or public.is_active_tablet_session() then
    raise exception 'No hay una sesion de usuario valida.';
  end if;

  if v_email is not null and (
    length(v_email) > 254
    or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$'
  ) then
    raise exception 'El correo electronico del cliente no es valido.';
  end if;
  if p_destination_area_id is not null and v_email is null then
    raise exception 'Registra un correo electronico valido para crear la derivacion.';
  end if;

  if v_email is not null then
    v_client := jsonb_set(v_client, '{email}', to_jsonb(v_email), true);
    update public.clients
    set email = v_email
    where dni = v_dni
      and email is distinct from v_email;
  end if;

  select public.create_customer_attention_legacy(
    v_client,
    p_service_channel_id,
    p_requester_type,
    p_conclusion,
    p_topics,
    p_kinship_type_id,
    p_destination_area_id,
    p_requester_detail,
    p_kinship_detail
  ) into v_result;
  return v_result;
end;
$$;

drop function public.conclude_attention_referral(uuid, text);

create function public.conclude_attention_referral(
  p_referral_id uuid,
  p_conclusion text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_name text;
  v_actor_area_id uuid;
  v_referral public.attention_referrals%rowtype;
  v_client_email text;
  v_rac_code text;
  v_survey_id uuid := gen_random_uuid();
  v_token uuid := gen_random_uuid();
  v_outbox_id uuid;
begin
  if auth.uid() is null or public.is_active_tablet_session() then
    raise exception 'No hay una sesion de usuario valida.';
  end if;
  if nullif(btrim(p_conclusion), '') is null then
    raise exception 'La conclusion de la derivacion es obligatoria.';
  end if;

  select
    concat_ws(' ', p.first_name, nullif(p.middle_name, ''),
      p.paternal_surname, p.maternal_surname),
    p.area_id
  into v_actor_name, v_actor_area_id
  from public.profiles p
  where p.id = auth.uid()
    and p.status = 'active';

  if not found then
    raise exception 'El usuario no tiene un perfil activo.';
  end if;

  select ar.* into v_referral
  from public.attention_referrals ar
  join public.customer_attentions ca
    on ca.id = ar.attention_id and ca.status = 'ACTIVE'
  join public.clients c on c.id = ca.client_id
  where ar.id = p_referral_id
    and ar.status = 'PENDING'
  for update of ar;

  if not found then
    raise exception 'La derivacion ya fue cerrada, no existe o la atencion esta inhabilitada.';
  end if;
  select lower(btrim(c.email)), ca.rac_code
  into v_client_email, v_rac_code
  from public.customer_attentions ca
  join public.clients c on c.id = ca.client_id
  where ca.id = v_referral.attention_id;
  if v_actor_area_id is null or v_actor_area_id is distinct from v_referral.destination_area_id then
    raise exception 'No perteneces al area de destino de la derivacion.';
  end if;

  update public.attention_referrals
  set status = 'RESOLVED',
      conclusion = btrim(p_conclusion),
      concluded_by = auth.uid(),
      concluded_by_name = v_actor_name,
      concluded_at = now()
  where id = v_referral.id and status = 'PENDING';

  if v_client_email is null
    or length(v_client_email) > 254
    or v_client_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$' then
    insert into public.referral_surveys (
      id, referral_id, status, closed_at, closed_reason
    ) values (
      v_survey_id, v_referral.id, 'CANCELLED', now(),
      'No se envio la encuesta: la derivacion historica no tiene un correo valido'
    );
    return jsonb_build_object(
      'referralStatus', 'RESOLVED',
      'surveyStatus', 'CANCELLED',
      'emailQueued', false,
      'message', 'La derivacion fue resuelta, pero no se envio correo porque el cliente no tiene una direccion valida.'
    );
  end if;

  while exists (
    select 1 from public.attention_surveys s where s.survey_token = v_token
    union all
    select 1 from public.referral_surveys rs where rs.survey_token = v_token
  ) loop
    v_token := gen_random_uuid();
  end loop;

  insert into public.email_outbox (
    event_type, aggregate_type, aggregate_id, recipient_email,
    template_key, template_data, idempotency_key
  ) values (
    'REFERRAL_RESOLVED',
    'REFERRAL',
    v_referral.id,
    v_client_email,
    'REFERRAL_RESOLVED',
    jsonb_build_object(
      'racCode', v_rac_code,
      'conclusion', btrim(p_conclusion),
      'surveyToken', v_token::text,
      'surveyId', v_survey_id::text
    ),
    'referral-resolved:' || v_referral.id::text
  )
  returning id into v_outbox_id;

  insert into public.referral_surveys (
    id, referral_id, status, recipient_email, survey_token, email_outbox_id
  ) values (
    v_survey_id, v_referral.id, 'QUEUED', v_client_email, v_token, v_outbox_id
  );

  return jsonb_build_object(
    'referralStatus', 'RESOLVED',
    'surveyStatus', 'QUEUED',
    'emailQueued', true,
    'recipientEmail', v_client_email,
    'message', 'La derivacion fue resuelta y el correo fue agregado a la cola.'
  );
end;
$$;

create or replace function public.get_public_referral_survey(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_survey public.referral_surveys%rowtype;
  v_rac_code text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Operacion reservada al servicio publico de encuestas.';
  end if;

  select rs.* into v_survey
  from public.referral_surveys rs
  join public.attention_referrals ar
    on ar.id = rs.referral_id and ar.status = 'RESOLVED'
  join public.customer_attentions ca
    on ca.id = ar.attention_id and ca.status = 'ACTIVE'
  where rs.survey_token = p_token
  for update of rs;

  if not found then
    return jsonb_build_object('state', 'INVALID');
  end if;
  select ca.rac_code into v_rac_code
  from public.attention_referrals ar
  join public.customer_attentions ca on ca.id = ar.attention_id
  where ar.id = v_survey.referral_id;

  if v_survey.status = 'SENT' and v_survey.token_expires_at <= now() then
    update public.referral_surveys
    set status = 'CANCELLED',
        closed_at = now(),
        closed_reason = 'La invitacion por correo vencio sin respuesta'
    where id = v_survey.id and status = 'SENT';
    return jsonb_build_object('state', 'EXPIRED', 'surveyKind', 'REFERRAL');
  end if;
  if v_survey.status = 'SENT' then
    return jsonb_build_object(
      'state', 'OPEN',
      'surveyKind', 'REFERRAL',
      'racCode', v_rac_code,
      'expiresAt', v_survey.token_expires_at
    );
  end if;
  if v_survey.status = 'QUEUED' then
    return jsonb_build_object('state', 'PENDING_DELIVERY', 'surveyKind', 'REFERRAL');
  end if;
  if v_survey.status = 'CANCELLED'
    and v_survey.closed_reason = 'La invitacion por correo vencio sin respuesta' then
    return jsonb_build_object('state', 'EXPIRED', 'surveyKind', 'REFERRAL');
  end if;
  return jsonb_build_object('state', 'CLOSED', 'surveyKind', 'REFERRAL');
end;
$$;

create or replace function public.respond_public_referral_survey(
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
  v_survey public.referral_surveys%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Operacion reservada al servicio publico de encuestas.';
  end if;
  if not p_skip and p_response not in (
    'VERY_SATISFIED', 'SATISFIED', 'DISSATISFIED', 'VERY_DISSATISFIED'
  ) then
    return jsonb_build_object('result', 'INVALID_RESPONSE');
  end if;

  select rs.* into v_survey
  from public.referral_surveys rs
  join public.attention_referrals ar
    on ar.id = rs.referral_id and ar.status = 'RESOLVED'
  join public.customer_attentions ca
    on ca.id = ar.attention_id and ca.status = 'ACTIVE'
  where rs.survey_token = p_token
  for update of rs;

  if not found then
    return jsonb_build_object('result', 'INVALID');
  end if;
  if v_survey.status = 'SENT' and v_survey.token_expires_at <= now() then
    update public.referral_surveys
    set status = 'CANCELLED', closed_at = now(),
        closed_reason = 'La invitacion por correo vencio sin respuesta'
    where id = v_survey.id;
    return jsonb_build_object('result', 'EXPIRED');
  end if;
  if v_survey.status <> 'SENT' then
    return jsonb_build_object('result', 'CLOSED');
  end if;

  if p_skip then
    update public.referral_surveys
    set status = 'SKIPPED', closed_at = now(),
        closed_reason = 'Omitida por el cliente desde el enlace de correo'
    where id = v_survey.id and status = 'SENT';
    return jsonb_build_object('result', 'SKIPPED');
  end if;

  update public.referral_surveys
  set status = 'COMPLETED', response = p_response, completed_at = now()
  where id = v_survey.id and status = 'SENT';
  return jsonb_build_object('result', 'COMPLETED');
end;
$$;

create or replace function public.sync_referral_email_delivery()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.event_type <> 'REFERRAL_RESOLVED'
    or new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'SENT' then
    update public.referral_surveys
    set status = 'SENT',
        sent_at = new.accepted_at,
        token_expires_at = new.accepted_at + interval '3 days'
    where email_outbox_id = new.id and status = 'QUEUED';
  elsif new.status = 'FAILED_PERMANENT' then
    update public.referral_surveys
    set status = 'CANCELLED',
        closed_at = now(),
        closed_reason = 'No se pudo enviar la encuesta por correo: ' ||
          coalesce(new.last_error_code, 'ERROR_DE_ENVIO')
    where email_outbox_id = new.id and status = 'QUEUED';
  end if;
  return new;
end;
$$;

create trigger email_outbox_sync_referral_survey
after update of status on public.email_outbox
for each row execute function public.sync_referral_email_delivery();

create or replace function public.cancel_referral_email_delivery()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status = 'QUEUED'
    and new.status in ('SKIPPED', 'CANCELLED') then
    update public.email_outbox
    set status = 'FAILED_PERMANENT',
        locked_at = null,
        locked_by = null,
        accepted_at = null,
        last_error_code = 'SURVEY_NO_LONGER_PENDING',
        last_error_message = 'La encuesta de la derivacion fue cerrada antes de entregar el correo.'
    where id = old.email_outbox_id
      and status in ('PENDING', 'RETRY', 'PROCESSING');
  end if;
  return new;
end;
$$;

create trigger referral_surveys_cancel_email_delivery
after update of status on public.referral_surveys
for each row execute function public.cancel_referral_email_delivery();

create or replace function public.close_attention_children()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if old.status = 'ACTIVE' and new.status = 'DISABLED' then
    update public.attention_surveys
    set status = 'CANCELLED', closed_by = new.disabled_by,
        closed_by_name = coalesce(new.disabled_by_name, 'Sistema'), closed_at = now(),
        closed_reason = 'Atencion inhabilitada: ' || coalesce(new.disabled_reason, 'Sin motivo')
    where attention_id = new.id and status in ('PENDING_DECISION', 'QUEUED', 'SENT');

    update public.referral_surveys rs
    set status = 'CANCELLED', closed_at = now(),
        closed_reason = 'Atencion inhabilitada: ' || coalesce(new.disabled_reason, 'Sin motivo')
    from public.attention_referrals ar
    where rs.referral_id = ar.id
      and ar.attention_id = new.id
      and rs.status in ('QUEUED', 'SENT');

    update public.attention_referrals
    set status = 'CANCELLED', cancelled_by = new.disabled_by,
        cancelled_by_name = coalesce(new.disabled_by_name, 'Sistema'), cancelled_at = now(),
        cancelled_reason = 'Atencion inhabilitada: ' || coalesce(new.disabled_reason, 'Sin motivo')
    where attention_id = new.id and status = 'PENDING';
  end if;
  return new;
end;
$$;

alter table public.referral_surveys enable row level security;

create policy "referral_surveys_select_authorized"
on public.referral_surveys
for select
to authenticated
using (
  not public.is_active_tablet_session()
  and exists (
    select 1
    from public.attention_referrals ar
    join public.customer_attentions ca on ca.id = ar.attention_id
    where ar.id = referral_surveys.referral_id
      and (
        public.is_admin()
        or ca.created_by = auth.uid()
        or ar.destination_area_id = (
          select p.area_id from public.profiles p
          where p.id = auth.uid() and p.status = 'active'
        )
      )
  )
);

revoke all on public.referral_surveys from public, anon, authenticated;
grant select (
  id, referral_id, status, response, recipient_email, token_expires_at,
  sent_at, completed_at, closed_at, closed_reason, created_at, updated_at
) on public.referral_surveys to authenticated;
grant select on public.referral_surveys to service_role;

revoke execute on function public.require_referral_client_email()
  from public, anon, authenticated;
revoke execute on function public.prevent_pending_referral_email_loss()
  from public, anon, authenticated;
revoke execute on function public.create_customer_attention(
  jsonb, uuid, text, text, jsonb, text, uuid, uuid, text, text
) from public, anon;
revoke execute on function public.create_customer_attention_legacy(
  jsonb, uuid, text, text, jsonb, uuid, uuid, text, text
) from public, anon, authenticated;
revoke execute on function public.conclude_attention_referral(uuid, text)
  from public, anon;
revoke execute on function public.get_public_referral_survey(uuid)
  from public, anon, authenticated;
revoke execute on function public.respond_public_referral_survey(uuid, text, boolean)
  from public, anon, authenticated;
revoke execute on function public.sync_referral_email_delivery()
  from public, anon, authenticated;
revoke execute on function public.cancel_referral_email_delivery()
  from public, anon, authenticated;

grant execute on function public.create_customer_attention(
  jsonb, uuid, text, text, jsonb, text, uuid, uuid, text, text
) to authenticated;
grant execute on function public.conclude_attention_referral(uuid, text)
  to authenticated;
grant execute on function public.get_public_referral_survey(uuid)
  to service_role;
grant execute on function public.respond_public_referral_survey(uuid, text, boolean)
  to service_role;

notify pgrst, 'reload schema';

commit;

