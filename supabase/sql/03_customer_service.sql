-- Etapa 1: base de datos del Registro de Atención al Cliente.
-- Ejecutar una sola vez después de 01_setup.sql.

begin;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  dni text not null unique check (dni ~ '^[0-9]{8}$'),
  first_name text not null check (btrim(first_name) <> ''),
  middle_name text,
  paternal_surname text not null check (btrim(paternal_surname) <> ''),
  maternal_surname text not null check (btrim(maternal_surname) <> ''),
  email text,
  phone text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (btrim(name) <> ''),
  detail text not null check (btrim(detail) <> ''),
  is_active boolean not null default true,
  disabled_by uuid references public.profiles(id) on delete set null,
  disabled_by_name text,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (is_active and disabled_at is null and disabled_by_name is null)
    or
    (not is_active
      and disabled_at is not null
      and disabled_by_name is not null
      and btrim(disabled_by_name) <> '')
  )
);

create table public.consultation_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (btrim(name) <> ''),
  display_order integer not null default 0,
  is_active boolean not null default true
);

create table public.consultation_topics (
  id uuid primary key default gen_random_uuid(),
  consultation_type_id uuid not null
    references public.consultation_types(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  display_order integer not null default 0,
  requires_absence_count boolean not null default false,
  is_active boolean not null default true,
  unique (consultation_type_id, name)
);

create table public.kinship_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (btrim(name) <> ''),
  display_order integer not null default 0,
  is_active boolean not null default true
);

create table public.rac_counters (
  rac_year integer primary key check (rac_year between 2000 and 9999),
  last_value bigint not null check (last_value > 0)
);

create table public.customer_attentions (
  id uuid primary key default gen_random_uuid(),
  rac_year integer not null check (rac_year between 2000 and 9999),
  rac_number bigint not null check (rac_number > 0),
  rac_code text not null unique
    check (rac_code ~ '^RAC-[0-9]+-[0-9]{4}$'),
  client_id uuid not null references public.clients(id) on delete restrict,
  service_channel_id uuid not null
    references public.service_channels(id) on delete restrict,
  requester_type text not null
    check (requester_type in ('APPLICANT', 'RELATIVE')),
  kinship_type_id uuid references public.kinship_types(id) on delete restrict,
  conclusion text not null check (btrim(conclusion) <> ''),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'DISABLED')),
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text not null check (btrim(created_by_name) <> ''),
  created_by_email text not null check (btrim(created_by_email) <> ''),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_by_name text,
  updated_at timestamptz not null default now(),
  disabled_reason text,
  disabled_by uuid references public.profiles(id) on delete set null,
  disabled_by_name text,
  disabled_at timestamptz,
  unique (rac_year, rac_number),
  check (
    (requester_type = 'APPLICANT' and kinship_type_id is null)
    or
    (requester_type = 'RELATIVE' and kinship_type_id is not null)
  ),
  check (
    (status = 'ACTIVE'
      and disabled_reason is null
      and disabled_by_name is null
      and disabled_at is null)
    or
    (status = 'DISABLED'
      and disabled_reason is not null
      and btrim(disabled_reason) <> ''
      and disabled_by_name is not null
      and btrim(disabled_by_name) <> ''
      and disabled_at is not null)
  )
);

create table public.attention_topics (
  attention_id uuid not null
    references public.customer_attentions(id) on delete cascade,
  topic_id uuid not null
    references public.consultation_topics(id) on delete restrict,
  absence_count integer check (absence_count > 0),
  primary key (attention_id, topic_id)
);

create table public.attention_referrals (
  id uuid primary key default gen_random_uuid(),
  attention_id uuid not null unique
    references public.customer_attentions(id) on delete cascade,
  destination_area_id uuid references public.areas(id) on delete set null,
  destination_area_name text not null check (btrim(destination_area_name) <> ''),
  referred_by uuid references public.profiles(id) on delete set null,
  referred_by_name text not null check (btrim(referred_by_name) <> ''),
  referred_at timestamptz not null default now(),
  conclusion text,
  concluded_by uuid references public.profiles(id) on delete set null,
  concluded_by_name text,
  concluded_at timestamptz,
  check (
    (conclusion is null and concluded_by_name is null and concluded_at is null)
    or
    (conclusion is not null
      and btrim(conclusion) <> ''
      and concluded_by_name is not null
      and btrim(concluded_by_name) <> ''
      and concluded_at is not null)
  )
);

create index clients_name_idx
  on public.clients (paternal_surname, maternal_surname, first_name);
create unique index service_channels_name_lower_idx
  on public.service_channels (lower(btrim(name)));
create unique index consultation_types_name_lower_idx
  on public.consultation_types (lower(btrim(name)));
create unique index kinship_types_name_lower_idx
  on public.kinship_types (lower(btrim(name)));
create index customer_attentions_client_id_idx
  on public.customer_attentions (client_id);
create index customer_attentions_channel_id_idx
  on public.customer_attentions (service_channel_id);
create index customer_attentions_created_at_idx
  on public.customer_attentions (created_at desc);
create index customer_attentions_status_idx
  on public.customer_attentions (status);
create index attention_topics_topic_id_idx
  on public.attention_topics (topic_id);
create index attention_referrals_area_id_idx
  on public.attention_referrals (destination_area_id);

create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

create trigger service_channels_set_updated_at
before update on public.service_channels
for each row execute function public.set_updated_at();

create trigger customer_attentions_set_updated_at
before update on public.customer_attentions
for each row execute function public.set_updated_at();

create or replace function public.validate_attention_topic()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_requires_absence_count boolean;
begin
  select ct.requires_absence_count
  into v_requires_absence_count
  from public.consultation_topics ct
  where ct.id = new.topic_id;

  if not found then
    raise exception 'El tema seleccionado no existe.';
  end if;

  if v_requires_absence_count and new.absence_count is null then
    raise exception 'Debes registrar el número de inasistencias.';
  end if;

  if not v_requires_absence_count and new.absence_count is not null then
    raise exception 'El número de inasistencias no corresponde a este tema.';
  end if;

  return new;
end;
$$;

create trigger attention_topics_validate
before insert or update on public.attention_topics
for each row execute function public.validate_attention_topic();

create or replace function public.prevent_pending_referral_area_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.attention_referrals ar
    where ar.destination_area_id = old.id
      and ar.conclusion is null
  ) then
    raise exception 'No se puede eliminar un área con derivaciones pendientes.';
  end if;

  return old;
end;
$$;

create trigger areas_prevent_pending_referral_delete
before delete on public.areas
for each row execute function public.prevent_pending_referral_area_delete();

insert into public.consultation_types (name, display_order)
values
  ('Información general', 10),
  ('Servicios Administrativos', 20),
  ('Académica', 30),
  ('Talento Humano', 40),
  ('Marketing y Comunicaciones', 50),
  ('Calidad', 60);

insert into public.consultation_topics (
  consultation_type_id,
  name,
  display_order,
  requires_absence_count
)
select ct.id, seed.name, seed.display_order, seed.requires_absence_count
from public.consultation_types ct
join (
  values
    ('Información general', 'Procesos', 10, false),
    ('Información general', 'Requisitos', 20, false),
    ('Información general', 'Fechas', 30, false),
    ('Información general', 'Beneficios', 40, false),
    ('Información general', 'Inversión', 50, false),
    ('Información general', 'Horarios', 60, false),
    ('Información general', 'Evaluación previa', 70, false),
    ('Información general', 'Agregar código modular', 80, false),
    ('Información general', 'Corrección de datos', 90, false),
    ('Información general', 'Correo registrado en SisAdmisión', 100, false),
    ('Información general', 'Correo CEPRUNSA', 110, false),
    ('Servicios Administrativos', 'Exoneración de pagos / Retiro', 10, false),
    ('Servicios Administrativos', 'Solicitud de grabaciones', 20, false),
    ('Servicios Administrativos', 'Justificación de faltas', 30, true),
    ('Servicios Administrativos', 'Constancia de Prestación de Servicios', 40, false),
    ('Servicios Administrativos', 'Pago de cuotas', 50, false),
    ('Servicios Administrativos', 'Cambio de turno', 60, false),
    ('Servicios Administrativos', 'Cambio de carrera', 70, false),
    ('Académica', 'No está en grupo de WhatsApp', 10, false),
    ('Académica', 'Monitores', 20, false),
    ('Académica', 'Supervisores', 30, false),
    ('Académica', 'Personal de Enseñanza', 40, false),
    ('Talento Humano', 'Capacitaciones', 10, false),
    ('Talento Humano', 'Evaluaciones', 20, false),
    ('Talento Humano', 'Comunicación en el proceso de convocatoria', 30, false),
    ('Marketing y Comunicaciones', 'Información', 10, false),
    ('Marketing y Comunicaciones', 'Mala imagen', 20, false),
    ('Marketing y Comunicaciones', 'Contenido', 30, false),
    ('Calidad', 'Sensibilización de los procesos de calidad', 10, false)
) as seed(type_name, name, display_order, requires_absence_count)
  on seed.type_name = ct.name;

insert into public.kinship_types (name, display_order)
values
  ('Padre', 10),
  ('Madre', 20),
  ('Hermano/a', 30),
  ('Tío/a', 40),
  ('Abuelo/a', 50),
  ('Tutor/a', 60),
  ('Otro', 70);

create or replace function public.create_customer_attention(
  p_client jsonb,
  p_service_channel_id uuid,
  p_requester_type text,
  p_conclusion text,
  p_topics jsonb,
  p_kinship_type_id uuid default null,
  p_destination_area_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_name text;
  v_actor_email text;
  v_client_id uuid;
  v_dni text := btrim(p_client ->> 'dni');
  v_year integer := extract(year from timezone('America/Lima', now()))::integer;
  v_number bigint;
  v_code text;
  v_attention_id uuid;
  v_area_name text;
  v_topic jsonb;
  v_topic_id uuid;
  v_absence_count integer;
  v_requires_absence_count boolean;
begin
  if v_user_id is null then
    raise exception 'No hay una sesión autenticada.';
  end if;

  select
    concat_ws(' ', p.first_name, nullif(p.middle_name, ''),
      p.paternal_surname, p.maternal_surname),
    p.email
  into v_actor_name, v_actor_email
  from public.profiles p
  where p.id = v_user_id and p.status = 'active';

  if not found then
    raise exception 'El usuario no tiene un perfil activo.';
  end if;

  if v_dni is null or v_dni !~ '^[0-9]{8}$' then
    raise exception 'El DNI debe contener exactamente 8 dígitos.';
  end if;

  if p_requester_type not in ('APPLICANT', 'RELATIVE') then
    raise exception 'El tipo de solicitante no es válido.';
  end if;

  if p_requester_type = 'APPLICANT' and p_kinship_type_id is not null then
    raise exception 'El postulante no debe tener parentesco.';
  end if;

  if p_requester_type = 'RELATIVE' then
    if p_kinship_type_id is null or not exists (
      select 1 from public.kinship_types kt
      where kt.id = p_kinship_type_id and kt.is_active
    ) then
      raise exception 'Selecciona un parentesco activo.';
    end if;
  end if;

  if p_conclusion is null or btrim(p_conclusion) = '' then
    raise exception 'La conclusión es obligatoria.';
  end if;

  if not exists (
    select 1 from public.service_channels sc
    where sc.id = p_service_channel_id and sc.is_active
  ) then
    raise exception 'Selecciona un medio de atención activo.';
  end if;

  if p_topics is null
    or jsonb_typeof(p_topics) <> 'array'
    or jsonb_array_length(p_topics) = 0 then
    raise exception 'Selecciona al menos un tema de consulta.';
  end if;

  select c.id into v_client_id
  from public.clients c
  where c.dni = v_dni;

  if v_client_id is null then
    insert into public.clients (
      dni, first_name, middle_name, paternal_surname, maternal_surname,
      email, phone, created_by
    )
    values (
      v_dni,
      nullif(btrim(p_client ->> 'first_name'), ''),
      nullif(btrim(p_client ->> 'middle_name'), ''),
      nullif(btrim(p_client ->> 'paternal_surname'), ''),
      nullif(btrim(p_client ->> 'maternal_surname'), ''),
      nullif(lower(btrim(p_client ->> 'email')), ''),
      nullif(btrim(p_client ->> 'phone'), ''),
      v_user_id
    )
    on conflict (dni) do nothing
    returning id into v_client_id;

    if v_client_id is null then
      select c.id into v_client_id
      from public.clients c
      where c.dni = v_dni;
    end if;
  end if;

  insert into public.rac_counters as counters (rac_year, last_value)
  values (v_year, 1)
  on conflict (rac_year) do update
    set last_value = counters.last_value + 1
  returning last_value into v_number;

  v_code := 'RAC-'
    || case
      when v_number < 1000 then lpad(v_number::text, 3, '0')
      else v_number::text
    end
    || '-' || v_year::text;

  insert into public.customer_attentions (
    rac_year, rac_number, rac_code, client_id, service_channel_id,
    requester_type, kinship_type_id, conclusion,
    created_by, created_by_name, created_by_email
  )
  values (
    v_year, v_number, v_code, v_client_id, p_service_channel_id,
    p_requester_type, p_kinship_type_id, btrim(p_conclusion),
    v_user_id, v_actor_name, v_actor_email
  )
  returning id into v_attention_id;

  for v_topic in select value from jsonb_array_elements(p_topics)
  loop
    begin
      v_topic_id := (v_topic ->> 'topic_id')::uuid;
      v_absence_count := nullif(v_topic ->> 'absence_count', '')::integer;
    exception
      when invalid_text_representation then
        raise exception 'La información de uno de los temas no es válida.';
    end;

    select ct.requires_absence_count
    into v_requires_absence_count
    from public.consultation_topics ct
    where ct.id = v_topic_id and ct.is_active;

    if not found then
      raise exception 'Uno de los temas seleccionados no está activo.';
    end if;

    if v_requires_absence_count and v_absence_count is null then
      raise exception 'Debes registrar el número de inasistencias.';
    end if;

    insert into public.attention_topics (
      attention_id, topic_id, absence_count
    ) values (
      v_attention_id, v_topic_id, v_absence_count
    );
  end loop;

  if p_destination_area_id is not null then
    select a.name into v_area_name
    from public.areas a
    where a.id = p_destination_area_id;

    if not found then
      raise exception 'El área de destino no existe.';
    end if;

    insert into public.attention_referrals (
      attention_id, destination_area_id, destination_area_name,
      referred_by, referred_by_name
    ) values (
      v_attention_id, p_destination_area_id, v_area_name,
      v_user_id, v_actor_name
    );
  end if;

  return jsonb_build_object(
    'id', v_attention_id,
    'rac_code', v_code
  );
exception
  when not_null_violation then
    raise exception 'Completa los nombres y ambos apellidos del cliente.';
  when unique_violation then
    raise exception 'No se pudo generar un registro único. Intenta nuevamente.';
end;
$$;

create or replace function public.update_customer_attention(
  p_attention_id uuid,
  p_client jsonb,
  p_service_channel_id uuid,
  p_requester_type text,
  p_conclusion text,
  p_topics jsonb,
  p_kinship_type_id uuid default null,
  p_destination_area_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_name text;
  v_client_id uuid;
  v_current_channel_id uuid;
  v_area_name text;
  v_topic jsonb;
  v_topic_id uuid;
  v_absence_count integer;
  v_requires_absence_count boolean;
  v_referral_id uuid;
  v_referral_conclusion text;
  v_referral_area_id uuid;
  v_existing_topic_ids uuid[];
begin
  if v_user_id is null or not public.is_admin() then
    raise exception 'Solo un administrador puede editar una atención.';
  end if;

  select concat_ws(' ', p.first_name, nullif(p.middle_name, ''),
    p.paternal_surname, p.maternal_surname)
  into v_actor_name
  from public.profiles p
  where p.id = v_user_id and p.status = 'active';

  if not found then
    raise exception 'El administrador no tiene un perfil activo.';
  end if;

  select ca.client_id, ca.service_channel_id
  into v_client_id, v_current_channel_id
  from public.customer_attentions ca
  where ca.id = p_attention_id and ca.status = 'ACTIVE'
  for update;

  if not found then
    raise exception 'La atención no existe o está inhabilitada.';
  end if;

  if p_requester_type not in ('APPLICANT', 'RELATIVE') then
    raise exception 'El tipo de solicitante no es válido.';
  end if;

  if p_requester_type = 'APPLICANT' and p_kinship_type_id is not null then
    raise exception 'El postulante no debe tener parentesco.';
  end if;

  if p_requester_type = 'RELATIVE' and (
    p_kinship_type_id is null or not exists (
      select 1 from public.kinship_types kt
      where kt.id = p_kinship_type_id
        and (kt.is_active or kt.id = (
          select ca.kinship_type_id from public.customer_attentions ca
          where ca.id = p_attention_id
        ))
    )
  ) then
    raise exception 'Selecciona un parentesco válido.';
  end if;

  if p_conclusion is null or btrim(p_conclusion) = '' then
    raise exception 'La conclusión es obligatoria.';
  end if;

  if not exists (
    select 1 from public.service_channels sc
    where sc.id = p_service_channel_id
      and (sc.is_active or sc.id = v_current_channel_id)
  ) then
    raise exception 'Selecciona un medio de atención activo.';
  end if;

  if p_topics is null
    or jsonb_typeof(p_topics) <> 'array'
    or jsonb_array_length(p_topics) = 0 then
    raise exception 'Selecciona al menos un tema de consulta.';
  end if;

  update public.clients
  set
    first_name = nullif(btrim(p_client ->> 'first_name'), ''),
    middle_name = nullif(btrim(p_client ->> 'middle_name'), ''),
    paternal_surname = nullif(btrim(p_client ->> 'paternal_surname'), ''),
    maternal_surname = nullif(btrim(p_client ->> 'maternal_surname'), ''),
    email = nullif(lower(btrim(p_client ->> 'email')), ''),
    phone = nullif(btrim(p_client ->> 'phone'), '')
  where id = v_client_id;

  update public.customer_attentions
  set
    service_channel_id = p_service_channel_id,
    requester_type = p_requester_type,
    kinship_type_id = p_kinship_type_id,
    conclusion = btrim(p_conclusion),
    updated_by = v_user_id,
    updated_by_name = v_actor_name
  where id = p_attention_id;

  select coalesce(array_agg(at.topic_id), array[]::uuid[])
  into v_existing_topic_ids
  from public.attention_topics at
  where at.attention_id = p_attention_id;

  delete from public.attention_topics where attention_id = p_attention_id;

  for v_topic in select value from jsonb_array_elements(p_topics)
  loop
    begin
      v_topic_id := (v_topic ->> 'topic_id')::uuid;
      v_absence_count := nullif(v_topic ->> 'absence_count', '')::integer;
    exception
      when invalid_text_representation then
        raise exception 'La información de uno de los temas no es válida.';
    end;

    select ct.requires_absence_count
    into v_requires_absence_count
    from public.consultation_topics ct
    where ct.id = v_topic_id
      and (
        ct.is_active
        or ct.id = any(v_existing_topic_ids)
      );

    if not found then
      raise exception 'Uno de los temas seleccionados no está activo.';
    end if;

    if v_requires_absence_count and (v_absence_count is null or v_absence_count < 1) then
      raise exception 'Debes registrar un número válido de inasistencias.';
    end if;

    insert into public.attention_topics (attention_id, topic_id, absence_count)
    values (
      p_attention_id,
      v_topic_id,
      case when v_requires_absence_count then v_absence_count else null end
    );
  end loop;

  select ar.id, ar.conclusion, ar.destination_area_id
  into v_referral_id, v_referral_conclusion, v_referral_area_id
  from public.attention_referrals ar
  where ar.attention_id = p_attention_id;

  if v_referral_id is not null and v_referral_conclusion is not null then
    if p_destination_area_id is distinct from v_referral_area_id then
      raise exception 'No se puede modificar una derivación que ya fue concluida.';
    end if;
  elsif p_destination_area_id is null then
    if v_referral_id is not null then
      delete from public.attention_referrals where id = v_referral_id;
    end if;
  else
    select a.name into v_area_name
    from public.areas a where a.id = p_destination_area_id;

    if not found then
      raise exception 'El área de destino no existe.';
    end if;

    if v_referral_id is null then
      insert into public.attention_referrals (
        attention_id, destination_area_id, destination_area_name,
        referred_by, referred_by_name
      ) values (
        p_attention_id, p_destination_area_id, v_area_name,
        v_user_id, v_actor_name
      );
    elsif p_destination_area_id is distinct from v_referral_area_id then
      update public.attention_referrals
      set
        destination_area_id = p_destination_area_id,
        destination_area_name = v_area_name,
        referred_by = v_user_id,
        referred_by_name = v_actor_name,
        referred_at = now()
      where id = v_referral_id;
    end if;
  end if;
exception
  when not_null_violation then
    raise exception 'Completa los nombres y ambos apellidos del cliente.';
  when unique_violation then
    raise exception 'No se pueden registrar temas duplicados.';
end;
$$;

create or replace function public.disable_customer_attention(
  p_attention_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_name text;
begin
  if v_user_id is null or not public.is_admin() then
    raise exception 'Solo un administrador puede inhabilitar una atención.';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'La causa de inhabilitación es obligatoria.';
  end if;

  select concat_ws(' ', p.first_name, nullif(p.middle_name, ''),
    p.paternal_surname, p.maternal_surname)
  into v_actor_name
  from public.profiles p
  where p.id = v_user_id and p.status = 'active';

  if not found then
    raise exception 'El administrador no tiene un perfil activo.';
  end if;

  update public.customer_attentions
  set
    status = 'DISABLED',
    disabled_reason = btrim(p_reason),
    disabled_by = v_user_id,
    disabled_by_name = v_actor_name,
    disabled_at = now(),
    updated_by = v_user_id,
    updated_by_name = v_actor_name
  where id = p_attention_id and status = 'ACTIVE';

  if not found then
    raise exception 'La atención no existe o ya está inhabilitada.';
  end if;
end;
$$;

create or replace function public.set_service_channel_status(
  p_service_channel_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_name text;
begin
  if v_user_id is null or not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar el estado de un medio.';
  end if;

  select concat_ws(' ', p.first_name, nullif(p.middle_name, ''),
    p.paternal_surname, p.maternal_surname)
  into v_actor_name
  from public.profiles p
  where p.id = v_user_id and p.status = 'active';

  if not found then
    raise exception 'El administrador no tiene un perfil activo.';
  end if;

  update public.service_channels
  set
    is_active = p_is_active,
    disabled_by = case when p_is_active then null else v_user_id end,
    disabled_by_name = case when p_is_active then null else v_actor_name end,
    disabled_at = case when p_is_active then null else now() end
  where id = p_service_channel_id;

  if not found then
    raise exception 'El medio de atención no existe.';
  end if;
end;
$$;

create or replace function public.conclude_attention_referral(
  p_referral_id uuid,
  p_conclusion text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_name text;
begin
  if v_user_id is null then
    raise exception 'No hay una sesión autenticada.';
  end if;

  if p_conclusion is null or btrim(p_conclusion) = '' then
    raise exception 'La conclusión de la derivación es obligatoria.';
  end if;

  select concat_ws(' ', p.first_name, nullif(p.middle_name, ''),
    p.paternal_surname, p.maternal_surname)
  into v_actor_name
  from public.profiles p
  join public.attention_referrals ar
    on ar.destination_area_id = p.area_id
  join public.customer_attentions ca
    on ca.id = ar.attention_id and ca.status = 'ACTIVE'
  where p.id = v_user_id
    and p.status = 'active'
    and ar.id = p_referral_id
    and ar.conclusion is null;

  if not found then
    raise exception 'No perteneces al área de destino o la derivación ya fue concluida.';
  end if;

  update public.attention_referrals
  set
    conclusion = btrim(p_conclusion),
    concluded_by = v_user_id,
    concluded_by_name = v_actor_name,
    concluded_at = now()
  where id = p_referral_id and conclusion is null;

  if not found then
    raise exception 'La derivación ya fue concluida.';
  end if;
end;
$$;

alter table public.clients enable row level security;
alter table public.service_channels enable row level security;
alter table public.consultation_types enable row level security;
alter table public.consultation_topics enable row level security;
alter table public.kinship_types enable row level security;
alter table public.rac_counters enable row level security;
alter table public.customer_attentions enable row level security;
alter table public.attention_topics enable row level security;
alter table public.attention_referrals enable row level security;

grant select on public.clients to authenticated;
grant update on public.clients to authenticated;
grant select, insert on public.service_channels to authenticated;
grant update (name, detail) on public.service_channels to authenticated;
grant select, insert, update on public.consultation_types to authenticated;
grant select, insert, update on public.consultation_topics to authenticated;
grant select, insert, update on public.kinship_types to authenticated;
grant select on public.customer_attentions to authenticated;
grant select on public.attention_topics to authenticated;
grant select on public.attention_referrals to authenticated;

create policy "clients_select_authenticated" on public.clients
for select to authenticated using (true);

create policy "clients_update_admin" on public.clients
for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "service_channels_select_authenticated"
on public.service_channels for select to authenticated using (true);

create policy "service_channels_insert_admin"
on public.service_channels for insert to authenticated
with check (
  public.is_admin()
  and is_active
  and disabled_by is null
  and disabled_by_name is null
  and disabled_at is null
);

create policy "service_channels_update_admin"
on public.service_channels for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "consultation_types_select_authenticated"
on public.consultation_types for select to authenticated using (true);

create policy "consultation_types_insert_admin"
on public.consultation_types for insert to authenticated
with check (public.is_admin());

create policy "consultation_types_update_admin"
on public.consultation_types for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "consultation_topics_select_authenticated"
on public.consultation_topics for select to authenticated using (true);

create policy "consultation_topics_insert_admin"
on public.consultation_topics for insert to authenticated
with check (public.is_admin());

create policy "consultation_topics_update_admin"
on public.consultation_topics for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "kinship_types_select_authenticated"
on public.kinship_types for select to authenticated using (true);

create policy "kinship_types_insert_admin"
on public.kinship_types for insert to authenticated
with check (public.is_admin());

create policy "kinship_types_update_admin"
on public.kinship_types for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "customer_attentions_select_by_status"
on public.customer_attentions for select to authenticated
using (status = 'ACTIVE' or public.is_admin());

create policy "attention_topics_select_visible_attention"
on public.attention_topics for select to authenticated
using (
  exists (
    select 1 from public.customer_attentions ca
    where ca.id = attention_id
      and (ca.status = 'ACTIVE' or public.is_admin())
  )
);

create policy "attention_referrals_select_visible_attention"
on public.attention_referrals for select to authenticated
using (
  exists (
    select 1 from public.customer_attentions ca
    where ca.id = attention_id
      and (ca.status = 'ACTIVE' or public.is_admin())
  )
);

revoke all on public.rac_counters from anon, authenticated;
revoke execute on function public.create_customer_attention(
  jsonb, uuid, text, text, jsonb, uuid, uuid
) from public, anon;
revoke execute on function public.disable_customer_attention(uuid, text)
  from public, anon;
revoke execute on function public.update_customer_attention(
  uuid, jsonb, uuid, text, text, jsonb, uuid, uuid
) from public, anon;
revoke execute on function public.set_service_channel_status(uuid, boolean)
  from public, anon;
revoke execute on function public.conclude_attention_referral(uuid, text)
  from public, anon;

grant execute on function public.create_customer_attention(
  jsonb, uuid, text, text, jsonb, uuid, uuid
) to authenticated;
grant execute on function public.disable_customer_attention(uuid, text)
  to authenticated;
grant execute on function public.update_customer_attention(
  uuid, jsonb, uuid, text, text, jsonb, uuid, uuid
) to authenticated;
grant execute on function public.set_service_channel_status(uuid, boolean)
  to authenticated;
grant execute on function public.conclude_attention_referral(uuid, text)
  to authenticated;

commit;
