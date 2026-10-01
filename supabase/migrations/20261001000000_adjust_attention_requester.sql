-- Ajusta el solicitante y elimina definitivamente la cantidad de inasistencias.
-- Ejecutar una sola vez en una instancia que ya instaló 03_customer_service.sql.

begin;

do $$
begin
  if exists (
    select 1 from public.attention_topics where absence_count is not null
  ) then
    raise exception 'Existen cantidades de inasistencias. Revisa esos datos antes de eliminar la columna.';
  end if;
end;
$$;

drop trigger if exists attention_topics_validate on public.attention_topics;
drop function if exists public.validate_attention_topic();

alter table public.attention_topics drop column absence_count;
alter table public.consultation_topics drop column requires_absence_count;

alter table public.customer_attentions
  add column requester_detail text,
  add column kinship_detail text;

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.customer_attentions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%requester_type%'
  loop
    execute format(
      'alter table public.customer_attentions drop constraint %I',
      v_constraint.conname
    );
  end loop;
end;
$$;

alter table public.customer_attentions
  add constraint customer_attentions_requester_type_check
    check (requester_type in ('APPLICANT', 'RELATIVE', 'OTHER')),
  add constraint customer_attentions_requester_detail_length_check
    check (requester_detail is null or length(btrim(requester_detail)) between 1 and 150),
  add constraint customer_attentions_kinship_detail_length_check
    check (kinship_detail is null or length(btrim(kinship_detail)) between 1 and 150),
  add constraint customer_attentions_requester_fields_check check (
    (requester_type = 'APPLICANT'
      and kinship_type_id is null
      and requester_detail is null
      and kinship_detail is null)
    or
    (requester_type = 'RELATIVE'
      and kinship_type_id is not null
      and requester_detail is null)
    or
    (requester_type = 'OTHER'
      and kinship_type_id is null
      and requester_detail is not null
      and kinship_detail is null)
  );

create or replace function public.validate_attention_requester()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_kinship_name text;
begin
  if new.requester_type = 'APPLICANT' then
    if new.kinship_type_id is not null
      or new.requester_detail is not null
      or new.kinship_detail is not null then
      raise exception 'El postulante no debe tener datos de parentesco u otro solicitante.';
    end if;
    return new;
  end if;

  if new.requester_type = 'OTHER' then
    if nullif(btrim(new.requester_detail), '') is null then
      raise exception 'Especifica quién realiza la consulta.';
    end if;
    if new.kinship_type_id is not null or new.kinship_detail is not null then
      raise exception 'El solicitante Otro no debe tener parentesco.';
    end if;
    new.requester_detail := btrim(new.requester_detail);
    return new;
  end if;

  if new.requester_type = 'RELATIVE' then
    select kt.name into v_kinship_name
    from public.kinship_types kt
    where kt.id = new.kinship_type_id;

    if not found then
      raise exception 'Selecciona un parentesco válido.';
    end if;

    if lower(btrim(v_kinship_name)) = 'otro' then
      if nullif(btrim(new.kinship_detail), '') is null then
        raise exception 'Especifica el parentesco del familiar.';
      end if;
      new.kinship_detail := btrim(new.kinship_detail);
    elsif new.kinship_detail is not null then
      raise exception 'El detalle de parentesco solo corresponde a la opción Otro.';
    end if;

    if new.requester_detail is not null then
      raise exception 'El familiar no debe tener detalle de otro solicitante.';
    end if;
    return new;
  end if;

  raise exception 'El tipo de solicitante no es válido.';
end;
$$;

create trigger customer_attentions_validate_requester
before insert or update of requester_type, kinship_type_id,
  requester_detail, kinship_detail on public.customer_attentions
for each row execute function public.validate_attention_requester();

drop function if exists public.create_customer_attention(
  jsonb, uuid, text, text, jsonb, uuid, uuid
);
drop function if exists public.update_customer_attention(
  uuid, jsonb, uuid, text, text, jsonb, uuid, uuid
);

create function public.create_customer_attention(
  p_client jsonb,
  p_service_channel_id uuid,
  p_requester_type text,
  p_conclusion text,
  p_topics jsonb,
  p_kinship_type_id uuid default null,
  p_destination_area_id uuid default null,
  p_requester_detail text default null,
  p_kinship_detail text default null
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
begin
  if v_user_id is null then
    raise exception 'No hay una sesión autenticada.';
  end if;

  select concat_ws(' ', p.first_name, nullif(p.middle_name, ''),
    p.paternal_surname, p.maternal_surname), p.email
  into v_actor_name, v_actor_email
  from public.profiles p
  where p.id = v_user_id and p.status = 'active';

  if not found then
    raise exception 'El usuario no tiene un perfil activo.';
  end if;
  if v_dni is null or v_dni !~ '^[0-9]{8}$' then
    raise exception 'El DNI debe contener exactamente 8 dígitos.';
  end if;
  if p_requester_type not in ('APPLICANT', 'RELATIVE', 'OTHER') then
    raise exception 'El tipo de solicitante no es válido.';
  end if;
  if p_requester_type = 'APPLICANT' and (
    p_kinship_type_id is not null
    or nullif(btrim(p_requester_detail), '') is not null
    or nullif(btrim(p_kinship_detail), '') is not null
  ) then
    raise exception 'El postulante no debe tener datos adicionales de solicitante.';
  end if;
  if p_requester_type = 'RELATIVE' and (
    p_kinship_type_id is null or not exists (
      select 1 from public.kinship_types kt
      where kt.id = p_kinship_type_id and kt.is_active
    )
  ) then
    raise exception 'Selecciona un parentesco activo.';
  end if;
  if p_requester_type = 'OTHER' and (
    p_kinship_type_id is not null
    or nullif(btrim(p_requester_detail), '') is null
    or nullif(btrim(p_kinship_detail), '') is not null
  ) then
    raise exception 'Especifica correctamente quién realiza la consulta.';
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
  if p_topics is null or jsonb_typeof(p_topics) <> 'array'
    or jsonb_array_length(p_topics) = 0 then
    raise exception 'Selecciona al menos un tema de consulta.';
  end if;

  select c.id into v_client_id from public.clients c where c.dni = v_dni;
  if v_client_id is null then
    insert into public.clients (
      dni, first_name, middle_name, paternal_surname, maternal_surname,
      email, phone, created_by
    ) values (
      v_dni, nullif(btrim(p_client ->> 'first_name'), ''),
      nullif(btrim(p_client ->> 'middle_name'), ''),
      nullif(btrim(p_client ->> 'paternal_surname'), ''),
      nullif(btrim(p_client ->> 'maternal_surname'), ''),
      nullif(lower(btrim(p_client ->> 'email')), ''),
      nullif(btrim(p_client ->> 'phone'), ''), v_user_id
    )
    on conflict (dni) do nothing returning id into v_client_id;

    if v_client_id is null then
      select c.id into v_client_id from public.clients c where c.dni = v_dni;
    end if;
  end if;

  insert into public.rac_counters as counters (rac_year, last_value)
  values (v_year, 1)
  on conflict (rac_year) do update
    set last_value = counters.last_value + 1
  returning last_value into v_number;

  v_code := 'RAC-'
    || case when v_number < 1000
      then lpad(v_number::text, 3, '0') else v_number::text end
    || '-' || v_year::text;

  insert into public.customer_attentions (
    rac_year, rac_number, rac_code, client_id, service_channel_id,
    requester_type, kinship_type_id, requester_detail, kinship_detail,
    conclusion, created_by, created_by_name, created_by_email
  ) values (
    v_year, v_number, v_code, v_client_id, p_service_channel_id,
    p_requester_type, p_kinship_type_id,
    nullif(btrim(p_requester_detail), ''), nullif(btrim(p_kinship_detail), ''),
    btrim(p_conclusion), v_user_id, v_actor_name, v_actor_email
  ) returning id into v_attention_id;

  for v_topic in select value from jsonb_array_elements(p_topics)
  loop
    begin
      v_topic_id := (v_topic ->> 'topic_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'La información de uno de los temas no es válida.';
    end;
    if not exists (
      select 1 from public.consultation_topics ct
      where ct.id = v_topic_id and ct.is_active
    ) then
      raise exception 'Uno de los temas seleccionados no está activo.';
    end if;
    insert into public.attention_topics (attention_id, topic_id)
    values (v_attention_id, v_topic_id);
  end loop;

  if p_destination_area_id is not null then
    select a.name into v_area_name from public.areas a
    where a.id = p_destination_area_id;
    if not found then raise exception 'El área de destino no existe.'; end if;
    insert into public.attention_referrals (
      attention_id, destination_area_id, destination_area_name,
      referred_by, referred_by_name
    ) values (
      v_attention_id, p_destination_area_id, v_area_name,
      v_user_id, v_actor_name
    );
  end if;

  return jsonb_build_object('id', v_attention_id, 'rac_code', v_code);
exception
  when not_null_violation then
    raise exception 'Completa los nombres y ambos apellidos del cliente.';
  when unique_violation then
    raise exception 'No se pudo generar un registro único. Intenta nuevamente.';
end;
$$;

create function public.update_customer_attention(
  p_attention_id uuid,
  p_client jsonb,
  p_service_channel_id uuid,
  p_requester_type text,
  p_conclusion text,
  p_topics jsonb,
  p_kinship_type_id uuid default null,
  p_destination_area_id uuid default null,
  p_requester_detail text default null,
  p_kinship_detail text default null
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
  into v_actor_name from public.profiles p
  where p.id = v_user_id and p.status = 'active';
  if not found then raise exception 'El administrador no tiene un perfil activo.'; end if;

  select ca.client_id, ca.service_channel_id
  into v_client_id, v_current_channel_id
  from public.customer_attentions ca
  where ca.id = p_attention_id and ca.status = 'ACTIVE' for update;
  if not found then raise exception 'La atención no existe o está inhabilitada.'; end if;

  if p_requester_type not in ('APPLICANT', 'RELATIVE', 'OTHER') then
    raise exception 'El tipo de solicitante no es válido.';
  end if;
  if p_requester_type = 'APPLICANT' and (
    p_kinship_type_id is not null
    or nullif(btrim(p_requester_detail), '') is not null
    or nullif(btrim(p_kinship_detail), '') is not null
  ) then
    raise exception 'El postulante no debe tener datos adicionales de solicitante.';
  end if;
  if p_requester_type = 'RELATIVE' and (
    p_kinship_type_id is null or not exists (
      select 1 from public.kinship_types kt where kt.id = p_kinship_type_id
        and (kt.is_active or kt.id = (
          select ca.kinship_type_id from public.customer_attentions ca
          where ca.id = p_attention_id
        ))
    )
  ) then
    raise exception 'Selecciona un parentesco válido.';
  end if;
  if p_requester_type = 'OTHER' and (
    p_kinship_type_id is not null
    or nullif(btrim(p_requester_detail), '') is null
    or nullif(btrim(p_kinship_detail), '') is not null
  ) then
    raise exception 'Especifica correctamente quién realiza la consulta.';
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
  if p_topics is null or jsonb_typeof(p_topics) <> 'array'
    or jsonb_array_length(p_topics) = 0 then
    raise exception 'Selecciona al menos un tema de consulta.';
  end if;

  update public.clients set
    first_name = nullif(btrim(p_client ->> 'first_name'), ''),
    middle_name = nullif(btrim(p_client ->> 'middle_name'), ''),
    paternal_surname = nullif(btrim(p_client ->> 'paternal_surname'), ''),
    maternal_surname = nullif(btrim(p_client ->> 'maternal_surname'), ''),
    email = nullif(lower(btrim(p_client ->> 'email')), ''),
    phone = nullif(btrim(p_client ->> 'phone'), '')
  where id = v_client_id;

  update public.customer_attentions set
    service_channel_id = p_service_channel_id,
    requester_type = p_requester_type,
    kinship_type_id = p_kinship_type_id,
    requester_detail = nullif(btrim(p_requester_detail), ''),
    kinship_detail = nullif(btrim(p_kinship_detail), ''),
    conclusion = btrim(p_conclusion), updated_by = v_user_id,
    updated_by_name = v_actor_name
  where id = p_attention_id;

  select coalesce(array_agg(at.topic_id), array[]::uuid[])
  into v_existing_topic_ids from public.attention_topics at
  where at.attention_id = p_attention_id;
  delete from public.attention_topics where attention_id = p_attention_id;

  for v_topic in select value from jsonb_array_elements(p_topics)
  loop
    begin
      v_topic_id := (v_topic ->> 'topic_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'La información de uno de los temas no es válida.';
    end;
    if not exists (
      select 1 from public.consultation_topics ct where ct.id = v_topic_id
        and (ct.is_active or ct.id = any(v_existing_topic_ids))
    ) then
      raise exception 'Uno de los temas seleccionados no está activo.';
    end if;
    insert into public.attention_topics (attention_id, topic_id)
    values (p_attention_id, v_topic_id);
  end loop;

  select ar.id, ar.conclusion, ar.destination_area_id
  into v_referral_id, v_referral_conclusion, v_referral_area_id
  from public.attention_referrals ar where ar.attention_id = p_attention_id;

  if v_referral_id is not null and v_referral_conclusion is not null then
    if p_destination_area_id is distinct from v_referral_area_id then
      raise exception 'No se puede modificar una derivación que ya fue concluida.';
    end if;
  elsif p_destination_area_id is null then
    if v_referral_id is not null then
      delete from public.attention_referrals where id = v_referral_id;
    end if;
  else
    select a.name into v_area_name from public.areas a
    where a.id = p_destination_area_id;
    if not found then raise exception 'El área de destino no existe.'; end if;
    if v_referral_id is null then
      insert into public.attention_referrals (
        attention_id, destination_area_id, destination_area_name,
        referred_by, referred_by_name
      ) values (
        p_attention_id, p_destination_area_id, v_area_name,
        v_user_id, v_actor_name
      );
    elsif p_destination_area_id is distinct from v_referral_area_id then
      update public.attention_referrals set
        destination_area_id = p_destination_area_id,
        destination_area_name = v_area_name,
        referred_by = v_user_id, referred_by_name = v_actor_name,
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

revoke execute on function public.create_customer_attention(
  jsonb, uuid, text, text, jsonb, uuid, uuid, text, text
) from public, anon;
revoke execute on function public.update_customer_attention(
  uuid, jsonb, uuid, text, text, jsonb, uuid, uuid, text, text
) from public, anon;
grant execute on function public.create_customer_attention(
  jsonb, uuid, text, text, jsonb, uuid, uuid, text, text
) to authenticated;
grant execute on function public.update_customer_attention(
  uuid, jsonb, uuid, text, text, jsonb, uuid, uuid, text, text
) to authenticated;

commit;
