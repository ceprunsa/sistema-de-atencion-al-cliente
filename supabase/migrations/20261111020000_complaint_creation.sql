-- Etapa 2 del modulo de quejas: registro transaccional y aviso inicial.
-- Ejecutar despues de 20_complaints_foundation.sql en proyectos nuevos.
begin;

alter table public.complaints
  add column request_id uuid;

alter table public.complaints
  alter column request_id set not null;

create unique index complaints_request_id_uidx
  on public.complaints (request_id);

alter table public.complaints
  drop constraint if exists complaints_description_length_check;
alter table public.complaints
  add constraint complaints_description_length_check
  check (length(btrim(description)) between 1 and 10000);

create or replace function public.guard_complaint_identity_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.request_id is distinct from new.request_id
    or old.complaint_year is distinct from new.complaint_year
    or old.complaint_number is distinct from new.complaint_number
    or old.complaint_code is distinct from new.complaint_code
    or old.client_id is distinct from new.client_id
    or old.attention_id is distinct from new.attention_id
    or old.service_channel_id is distinct from new.service_channel_id
    or old.responsible_area_id is distinct from new.responsible_area_id
    or old.closure_area_id is distinct from new.closure_area_id
    or old.created_by is distinct from new.created_by
    or old.created_at is distinct from new.created_at then
    raise exception 'Los datos de origen de una queja no se pueden modificar.';
  end if;
  return new;
end;
$$;

alter table public.email_outbox
  drop constraint if exists email_outbox_event_type_check,
  drop constraint if exists email_outbox_aggregate_type_check,
  drop constraint if exists email_outbox_template_key_check,
  drop constraint if exists email_outbox_check1,
  drop constraint if exists email_outbox_aggregate_event_check;

alter table public.email_outbox
  add constraint email_outbox_event_type_check check (event_type in (
    'REFERRAL_CREATED', 'ATTENTION_SURVEY', 'REFERRAL_RESOLVED',
    'COMPLAINT_CREATED'
  )),
  add constraint email_outbox_aggregate_type_check check (aggregate_type in (
    'ATTENTION', 'REFERRAL', 'COMPLAINT'
  )),
  add constraint email_outbox_template_key_check check (template_key in (
    'REFERRAL_CREATED', 'ATTENTION_SURVEY', 'REFERRAL_RESOLVED',
    'COMPLAINT_CREATED'
  )),
  add constraint email_outbox_aggregate_event_check check (
    (event_type = 'ATTENTION_SURVEY' and aggregate_type = 'ATTENTION')
    or
    (event_type in ('REFERRAL_CREATED', 'REFERRAL_RESOLVED')
      and aggregate_type = 'REFERRAL')
    or
    (event_type = 'COMPLAINT_CREATED' and aggregate_type = 'COMPLAINT')
  );

create or replace function public.find_attention_for_complaint(p_rac_code text)
returns table (
  attention_id uuid,
  rac_code text,
  client_id uuid,
  client_dni text,
  client_display_name text,
  client_first_name text,
  client_middle_name text,
  client_paternal_surname text,
  client_maternal_surname text,
  client_email text,
  client_phone text,
  client_created_at timestamptz,
  client_updated_at timestamptz,
  attention_created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_code text := upper(nullif(btrim(p_rac_code), ''));
begin
  if auth.uid() is null
    or public.is_active_tablet_session()
    or not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'active'
    ) then
    raise exception 'No tienes permiso para consultar atenciones.'
      using errcode = '42501';
  end if;

  if v_code is null or v_code !~ '^RAC-[0-9]+-[0-9]{4}$' then
    raise exception 'Ingresa un codigo RAC valido.';
  end if;

  return query
  select ca.id, ca.rac_code, c.id, c.dni, c.display_name,
    c.first_name, c.middle_name, c.paternal_surname, c.maternal_surname,
    c.email, c.phone, c.created_at, c.updated_at, ca.created_at
  from public.customer_attentions ca
  join public.clients c on c.id = ca.client_id
  where ca.rac_code = v_code
    and ca.status = 'ACTIVE'
  limit 1;
end;
$$;

alter function public.find_attention_for_complaint(text) owner to postgres;

create or replace function public.create_complaint(
  p_request_id uuid,
  p_client jsonb,
  p_attention_id uuid,
  p_service_channel_id uuid,
  p_responsible_area_id uuid,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_name text;
  v_actor_email text;
  v_requested_client_id uuid;
  v_attention_client_id uuid;
  v_client public.clients%rowtype;
  v_dni text := nullif(btrim(p_client ->> 'dni'), '');
  v_first_name text := nullif(btrim(p_client ->> 'first_name'), '');
  v_middle_name text := nullif(btrim(p_client ->> 'middle_name'), '');
  v_paternal_surname text := nullif(btrim(p_client ->> 'paternal_surname'), '');
  v_maternal_surname text := nullif(btrim(p_client ->> 'maternal_surname'), '');
  v_email text := lower(nullif(btrim(p_client ->> 'email'), ''));
  v_phone text := nullif(btrim(p_client ->> 'phone'), '');
  v_description text := nullif(btrim(p_description), '');
  v_responsible_area_name text;
  v_responsible_group_email text;
  v_closure_area_id uuid;
  v_year integer;
  v_number bigint;
  v_code text;
  v_complaint_id uuid;
  v_existing public.complaints%rowtype;
  v_outbox_id uuid;
begin
  if p_request_id is null then
    raise exception 'No se recibio el identificador de la solicitud.';
  end if;

  if v_user_id is null or public.is_active_tablet_session() then
    raise exception 'No hay una sesion de usuario valida.'
      using errcode = '42501';
  end if;

  select concat_ws(' ', p.first_name, nullif(p.middle_name, ''),
    p.paternal_surname, p.maternal_surname), p.email
  into v_actor_name, v_actor_email
  from public.profiles p
  where p.id = v_user_id and p.status = 'active';

  if not found then
    raise exception 'Tu usuario no esta activo.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  select c.* into v_existing
  from public.complaints c
  where c.request_id = p_request_id;

  if found then
    if v_existing.created_by is distinct from v_user_id then
      raise exception 'El identificador de la solicitud ya fue utilizado.'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'id', v_existing.id,
      'complaint_code', v_existing.complaint_code,
      'notification_queued', true,
      'reused_request', true
    );
  end if;

  if not public.can_create_complaints() then
    if not exists (
      select 1
      from public.complaint_settings cs
      join public.areas a on a.id = cs.closure_area_id and a.is_active
      where cs.singleton_id = 1
    ) then
      raise exception 'Configura un area activa para el cierre de quejas antes de registrar una.'
        using errcode = '55000';
    end if;
    raise exception 'No tienes permiso para registrar quejas.'
      using errcode = '42501';
  end if;

  if v_dni is null or v_dni !~ '^[0-9]{8}$' then
    raise exception 'El DNI debe contener exactamente 8 digitos.';
  end if;
  if v_first_name is null
    or v_paternal_surname is null
    or v_maternal_surname is null then
    raise exception 'El primer nombre y ambos apellidos son obligatorios.';
  end if;
  if v_email is null
    or length(v_email) > 254
    or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$' then
    raise exception 'Registra un correo electronico valido para el cliente.';
  end if;
  if v_description is null or length(v_description) > 10000 then
    raise exception 'La descripcion de la queja es obligatoria y admite hasta 10000 caracteres.';
  end if;

  begin
    v_requested_client_id := nullif(p_client ->> 'id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'El cliente seleccionado no es valido.';
  end;

  perform 1
  from public.service_channels sc
  where sc.id = p_service_channel_id and sc.is_active
  for update;

  if not found then
    raise exception 'Selecciona un medio de atencion activo.';
  end if;

  select a.name, lower(btrim(a.group_email))
  into v_responsible_area_name, v_responsible_group_email
  from public.areas a
  where a.id = p_responsible_area_id and a.is_active
  for update;

  if not found then
    raise exception 'Selecciona un area responsable activa.';
  end if;
  if v_responsible_group_email !~ '^[^[:space:]@]+@cepr[.]unsa[.]pe$' then
    raise exception 'El area responsable no tiene un correo grupal valido.';
  end if;

  select cs.closure_area_id into v_closure_area_id
  from public.complaint_settings cs
  join public.areas a on a.id = cs.closure_area_id and a.is_active
  where cs.singleton_id = 1
  for update of cs, a;

  if not found then
    raise exception 'Configura un area activa para el cierre de quejas antes de registrar una.'
      using errcode = '55000';
  end if;

  if p_attention_id is not null then
    select ca.client_id into v_attention_client_id
    from public.customer_attentions ca
    where ca.id = p_attention_id and ca.status = 'ACTIVE'
    for update;

    if not found then
      raise exception 'El RAC seleccionado no existe o esta inhabilitado.';
    end if;
    if v_requested_client_id is not null
      and v_requested_client_id <> v_attention_client_id then
      raise exception 'El cliente seleccionado no corresponde al RAC.';
    end if;
    v_requested_client_id := v_attention_client_id;
  end if;

  if v_requested_client_id is not null then
    select c.* into v_client
    from public.clients c
    where c.id = v_requested_client_id
    for update;

    if not found or v_client.dni is distinct from v_dni then
      raise exception 'El cliente seleccionado ya no coincide con el DNI consultado.';
    end if;
  else
    select c.* into v_client
    from public.clients c
    where c.dni = v_dni
    for update;
  end if;

  if v_client.id is null then
    if p_attention_id is not null then
      raise exception 'El cliente relacionado con el RAC ya no esta disponible.';
    end if;

    insert into public.clients (
      dni, display_name, first_name, middle_name, paternal_surname,
      maternal_surname, email, phone, created_by
    ) values (
      v_dni,
      concat_ws(' ', v_first_name, v_middle_name,
        v_paternal_surname, v_maternal_surname),
      v_first_name, v_middle_name, v_paternal_surname,
      v_maternal_surname, v_email, v_phone, v_user_id
    )
    on conflict (dni) do nothing
    returning * into v_client;

    if v_client.id is null then
      select c.* into v_client
      from public.clients c
      where c.dni = v_dni
      for update;
    end if;
  end if;

  update public.clients c
  set first_name = coalesce(c.first_name, v_first_name),
      middle_name = coalesce(c.middle_name, v_middle_name),
      paternal_surname = coalesce(c.paternal_surname, v_paternal_surname),
      maternal_surname = coalesce(c.maternal_surname, v_maternal_surname),
      display_name = case
        when nullif(btrim(c.display_name), '') is null then
          concat_ws(' ', coalesce(c.first_name, v_first_name),
            coalesce(c.middle_name, v_middle_name),
            coalesce(c.paternal_surname, v_paternal_surname),
            coalesce(c.maternal_surname, v_maternal_surname))
        else c.display_name
      end,
      email = v_email,
      phone = coalesce(v_phone, c.phone)
  where c.id = v_client.id
  returning * into v_client;

  if v_client.dni is null
    or v_client.first_name is null
    or v_client.paternal_surname is null
    or v_client.maternal_surname is null
    or v_client.email is null then
    raise exception 'El cliente no tiene todos los datos obligatorios para una queja.';
  end if;

  select r.complaint_year, r.complaint_number, r.complaint_code
  into v_year, v_number, v_code
  from public.reserve_complaint_code() r;

  insert into public.complaints (
    request_id, complaint_year, complaint_number, complaint_code,
    client_id, attention_id, service_channel_id,
    responsible_area_id, closure_area_id, description,
    created_by, created_by_name, created_by_email
  ) values (
    p_request_id, v_year, v_number, v_code,
    v_client.id, p_attention_id, p_service_channel_id,
    p_responsible_area_id, v_closure_area_id, v_description,
    v_user_id, v_actor_name, v_actor_email
  )
  returning id into v_complaint_id;

  insert into public.email_outbox (
    event_type, aggregate_type, aggregate_id, recipient_email,
    template_key, template_data, idempotency_key
  ) values (
    'COMPLAINT_CREATED', 'COMPLAINT', v_complaint_id,
    v_responsible_group_email, 'COMPLAINT_CREATED',
    jsonb_build_object(
      'complaintId', v_complaint_id,
      'complaintCode', v_code,
      'responsibleAreaId', p_responsible_area_id,
      'responsibleAreaName', v_responsible_area_name,
      'description', v_description
    ),
    'complaint-created:' || v_complaint_id::text
  )
  returning id into v_outbox_id;

  insert into public.complaint_communications (
    complaint_id, communication_type, recipient_email,
    idempotency_key, outbox_id
  ) values (
    v_complaint_id, 'COMPLAINT_CREATED', v_responsible_group_email,
    'complaint-created:' || v_complaint_id::text, v_outbox_id
  );

  insert into public.complaint_events (
    complaint_id, event_type, new_status,
    actor_id, actor_name, actor_area_id, metadata
  ) values (
    v_complaint_id, 'CREATED', 'PENDING_MANAGEMENT',
    v_user_id, v_actor_name, public.current_active_profile_area_id(),
    jsonb_build_object(
      'requestId', p_request_id,
      'attentionId', p_attention_id,
      'notificationOutboxId', v_outbox_id
    )
  );

  return jsonb_build_object(
    'id', v_complaint_id,
    'complaint_code', v_code,
    'notification_queued', true,
    'reused_request', false
  );
exception
  when unique_violation then
    raise exception 'La queja no pudo registrarse porque existe un dato duplicado.';
end;
$$;

alter function public.create_complaint(
  uuid, jsonb, uuid, uuid, uuid, text
) owner to postgres;

revoke execute on function public.find_attention_for_complaint(text)
  from public, anon;
revoke execute on function public.create_complaint(
  uuid, jsonb, uuid, uuid, uuid, text
) from public, anon;

grant execute on function public.find_attention_for_complaint(text)
  to authenticated;
grant execute on function public.create_complaint(
  uuid, jsonb, uuid, uuid, uuid, text
) to authenticated;

commit;
