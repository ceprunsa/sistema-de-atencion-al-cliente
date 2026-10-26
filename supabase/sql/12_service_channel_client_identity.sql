-- Etapa 3: categoria estable del medio y clientes de correo sin DNI.
begin;

alter table public.service_channels
  add column if not exists category text;

alter table public.service_channels
  drop constraint if exists service_channels_category_check;
alter table public.service_channels
  add constraint service_channels_category_check
  check (category in ('IN_PERSON', 'PHONE', 'EMAIL'));

alter table public.service_channels
  drop constraint if exists service_channels_category_required;
alter table public.service_channels
  add constraint service_channels_category_required
  check (category is not null) not valid;

alter table public.clients
  add column if not exists display_name text;

update public.clients
set display_name = concat_ws(
  ' ',
  nullif(btrim(first_name), ''),
  nullif(btrim(middle_name), ''),
  nullif(btrim(paternal_surname), ''),
  nullif(btrim(maternal_surname), '')
)
where nullif(btrim(display_name), '') is null;

alter table public.clients
  alter column display_name set not null,
  alter column dni drop not null,
  alter column first_name drop not null,
  alter column paternal_surname drop not null,
  alter column maternal_surname drop not null;

alter table public.clients
  drop constraint if exists clients_display_name_check;
alter table public.clients
  add constraint clients_display_name_check
  check (length(btrim(display_name)) between 1 and 250);

create index if not exists clients_email_lower_idx
  on public.clients (lower(btrim(email)))
  where email is not null;

grant update (name, detail, category) on public.service_channels to authenticated;

create or replace function public.prevent_used_service_channel_category_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.category is not null
    and new.category is distinct from old.category
    and exists (
      select 1 from public.customer_attentions ca
      where ca.service_channel_id = old.id
    ) then
    raise exception 'No se puede cambiar la categoria de un medio que ya tiene atenciones.';
  end if;
  return new;
end;
$$;

drop trigger if exists service_channels_preserve_used_category
on public.service_channels;
create trigger service_channels_preserve_used_category
before update of category on public.service_channels
for each row execute function public.prevent_used_service_channel_category_change();

create or replace function public.create_customer_attention_v2(
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
  v_user_id uuid := auth.uid();
  v_actor_name text;
  v_actor_email text;
  v_client_id uuid;
  v_requested_client_id uuid;
  v_existing_dni text;
  v_create_new boolean := coalesce((p_client ->> 'create_new')::boolean, false);
  v_category text;
  v_dni text := nullif(btrim(p_client ->> 'dni'), '');
  v_display_name text := nullif(btrim(p_client ->> 'display_name'), '');
  v_first_name text := nullif(btrim(p_client ->> 'first_name'), '');
  v_middle_name text := nullif(btrim(p_client ->> 'middle_name'), '');
  v_paternal_surname text := nullif(btrim(p_client ->> 'paternal_surname'), '');
  v_maternal_surname text := nullif(btrim(p_client ->> 'maternal_surname'), '');
  v_email text := lower(nullif(btrim(p_client_contact_email), ''));
  v_phone text := nullif(btrim(p_client ->> 'phone'), '');
  v_year integer := extract(year from timezone('America/Lima', now()))::integer;
  v_number bigint;
  v_code text;
  v_attention_id uuid;
  v_area_name text;
  v_topic jsonb;
  v_topic_id uuid;
begin
  if v_user_id is null or public.is_active_tablet_session() then
    raise exception 'No hay una sesion de usuario valida.';
  end if;

  select
    concat_ws(' ', p.first_name, nullif(p.middle_name, ''), p.paternal_surname, p.maternal_surname),
    p.email
  into v_actor_name, v_actor_email
  from public.profiles p
  where p.id = v_user_id and p.status = 'active';

  if not found then
    raise exception 'El usuario no tiene un perfil activo.';
  end if;

  select sc.category into v_category
  from public.service_channels sc
  where sc.id = p_service_channel_id and sc.is_active;

  if not found then
    raise exception 'Selecciona un medio de atencion activo.';
  end if;
  if v_category is null then
    raise exception 'El medio de atencion no tiene una categoria configurada.';
  end if;

  if v_dni is not null and v_dni !~ '^[0-9]{8}$' then
    raise exception 'El DNI debe contener exactamente 8 digitos.';
  end if;
  if v_email is not null and (
    length(v_email) > 254
    or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$'
  ) then
    raise exception 'El correo electronico del cliente no es valido.';
  end if;

  if v_category in ('IN_PERSON', 'PHONE') then
    if v_dni is null then
      raise exception 'El DNI es obligatorio para atenciones presenciales o telefonicas.';
    end if;
    if v_first_name is null or v_paternal_surname is null or v_maternal_surname is null then
      raise exception 'Completa el primer nombre y ambos apellidos del cliente.';
    end if;
    v_display_name := coalesce(
      v_display_name,
      concat_ws(' ', v_first_name, v_middle_name, v_paternal_surname, v_maternal_surname)
    );
  elsif v_category = 'EMAIL' then
    if v_email is null then
      raise exception 'El correo electronico es obligatorio para este medio.';
    end if;
    if v_display_name is null then
      raise exception 'El nombre o denominacion del correo es obligatorio.';
    end if;
    begin
      v_requested_client_id := nullif(p_client ->> 'id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'El cliente seleccionado no es valido.';
    end;
    if v_requested_client_id is null and not v_create_new then
      raise exception 'Busca el correo y elige un cliente o confirma la creacion de uno nuevo.';
    end if;
    if v_requested_client_id is not null and v_create_new then
      raise exception 'La decision sobre el cliente es contradictoria.';
    end if;
  end if;

  if p_destination_area_id is not null and v_email is null then
    raise exception 'Registra un correo electronico valido para crear la derivacion.';
  end if;

  if p_requester_type not in ('APPLICANT', 'RELATIVE', 'OTHER') then
    raise exception 'El tipo de solicitante no es valido.';
  end if;
  if p_requester_type = 'APPLICANT' and (
    p_kinship_type_id is not null
    or nullif(btrim(p_requester_detail), '') is not null
    or nullif(btrim(p_kinship_detail), '') is not null
  ) then
    raise exception 'El postulante no debe tener datos adicionales de solicitante.';
  end if;
  if p_requester_type = 'RELATIVE' and (
    p_kinship_type_id is null
    or not exists (
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
    raise exception 'Especifica correctamente quien realiza la consulta.';
  end if;
  if nullif(btrim(p_conclusion), '') is null then
    raise exception 'La conclusion es obligatoria.';
  end if;
  if p_topics is null
    or jsonb_typeof(p_topics) <> 'array'
    or jsonb_array_length(p_topics) = 0 then
    raise exception 'Selecciona al menos un tema de consulta.';
  end if;

  if v_category = 'EMAIL' and v_requested_client_id is not null then
    select c.id, c.dni into v_client_id, v_existing_dni
    from public.clients c
    where c.id = v_requested_client_id
      and (lower(btrim(c.email)) = v_email or (v_dni is not null and c.dni = v_dni))
    for update;

    if not found then
      raise exception 'El cliente elegido ya no coincide con el correo o DNI consultado.';
    end if;
    if v_dni is not null and v_existing_dni is not null and v_dni is distinct from v_existing_dni then
      raise exception 'No se puede reemplazar el DNI del cliente seleccionado.';
    end if;

    update public.clients
    set dni = coalesce(v_dni, dni),
        display_name = v_display_name,
        first_name = coalesce(v_first_name, first_name),
        middle_name = coalesce(v_middle_name, middle_name),
        paternal_surname = coalesce(v_paternal_surname, paternal_surname),
        maternal_surname = coalesce(v_maternal_surname, maternal_surname),
        email = v_email,
        phone = coalesce(v_phone, phone)
    where id = v_client_id;
  elsif v_category = 'EMAIL' then
    if v_dni is not null and exists (select 1 from public.clients c where c.dni = v_dni) then
      raise exception 'Ya existe un cliente con ese DNI. Seleccionalo antes de continuar.';
    end if;
    insert into public.clients (
      dni, display_name, first_name, middle_name, paternal_surname,
      maternal_surname, email, phone, created_by
    ) values (
      v_dni, v_display_name, v_first_name, v_middle_name, v_paternal_surname,
      v_maternal_surname, v_email, v_phone, v_user_id
    )
    returning id into v_client_id;
  else
    select c.id into v_client_id
    from public.clients c
    where c.dni = v_dni
    for update;

    if v_client_id is null then
      insert into public.clients (
        dni, display_name, first_name, middle_name, paternal_surname,
        maternal_surname, email, phone, created_by
      ) values (
        v_dni, v_display_name, v_first_name, v_middle_name,
        v_paternal_surname, v_maternal_surname, v_email, v_phone, v_user_id
      )
      on conflict (dni) do nothing
      returning id into v_client_id;

      if v_client_id is null then
        select c.id into v_client_id from public.clients c where c.dni = v_dni;
      end if;
    elsif v_email is not null then
      update public.clients set email = v_email where id = v_client_id and email is distinct from v_email;
    end if;
  end if;

  insert into public.rac_counters as counters (rac_year, last_value)
  values (v_year, 1)
  on conflict (rac_year) do update
    set last_value = counters.last_value + 1
  returning last_value into v_number;

  v_code := 'RAC-' || case when v_number < 1000
    then lpad(v_number::text, 3, '0') else v_number::text end || '-' || v_year::text;

  insert into public.customer_attentions (
    rac_year, rac_number, rac_code, client_id, service_channel_id,
    requester_type, kinship_type_id, requester_detail, kinship_detail, conclusion,
    created_by, created_by_name, created_by_email
  ) values (
    v_year, v_number, v_code, v_client_id, p_service_channel_id,
    p_requester_type, p_kinship_type_id,
    nullif(btrim(p_requester_detail), ''), nullif(btrim(p_kinship_detail), ''),
    btrim(p_conclusion), v_user_id, v_actor_name, v_actor_email
  )
  returning id into v_attention_id;

  for v_topic in select value from jsonb_array_elements(p_topics)
  loop
    begin
      v_topic_id := (v_topic ->> 'topic_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'La informacion de uno de los temas no es valida.';
    end;
    if not exists (
      select 1 from public.consultation_topics ct
      where ct.id = v_topic_id and ct.is_active
    ) then
      raise exception 'Uno de los temas seleccionados no esta activo.';
    end if;
    insert into public.attention_topics (attention_id, topic_id)
    values (v_attention_id, v_topic_id);
  end loop;

  if p_destination_area_id is not null then
    select a.name into v_area_name
    from public.areas a
    where a.id = p_destination_area_id;
    if not found then raise exception 'El area de destino no existe.'; end if;
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
  when unique_violation then
    raise exception 'El DNI ya pertenece a otro cliente o hay datos duplicados.';
end;
$$;

create or replace function public.update_customer_attention_v2(
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
set search_path = public, pg_temp
as $$
declare
  v_category text;
  v_client_id uuid;
  v_existing_dni text;
  v_dni text := nullif(btrim(p_client ->> 'dni'), '');
  v_display_name text := nullif(btrim(p_client ->> 'display_name'), '');
  v_first_name text := nullif(btrim(p_client ->> 'first_name'), '');
  v_paternal_surname text := nullif(btrim(p_client ->> 'paternal_surname'), '');
  v_maternal_surname text := nullif(btrim(p_client ->> 'maternal_surname'), '');
  v_email text := lower(nullif(btrim(p_client ->> 'email'), ''));
begin
  select sc.category into v_category
  from public.service_channels sc
  where sc.id = p_service_channel_id;

  if v_category is null then
    raise exception 'El medio de atencion no tiene una categoria configurada.';
  end if;
  if v_dni is not null and v_dni !~ '^[0-9]{8}$' then
    raise exception 'El DNI debe contener exactamente 8 digitos.';
  end if;
  if v_email is not null and v_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$' then
    raise exception 'El correo electronico del cliente no es valido.';
  end if;
  if v_category in ('IN_PERSON', 'PHONE') and (
    v_dni is null or v_first_name is null
    or v_paternal_surname is null or v_maternal_surname is null
  ) then
    raise exception 'El DNI, el primer nombre y ambos apellidos son obligatorios.';
  end if;
  if v_category = 'EMAIL' and (v_email is null or v_display_name is null) then
    raise exception 'El correo y el nombre o denominacion son obligatorios.';
  end if;
  if p_destination_area_id is not null and v_email is null then
    raise exception 'Registra un correo electronico valido para guardar la derivacion.';
  end if;

  select ca.client_id, c.dni into v_client_id, v_existing_dni
  from public.customer_attentions ca
  join public.clients c on c.id = ca.client_id
  where ca.id = p_attention_id;
  if v_existing_dni is not null and v_dni is distinct from v_existing_dni then
    raise exception 'No se puede reemplazar ni eliminar un DNI ya registrado.';
  end if;

  perform public.update_customer_attention(
    p_attention_id, p_client, p_service_channel_id, p_requester_type,
    p_conclusion, p_topics, p_kinship_type_id, p_destination_area_id,
    p_requester_detail, p_kinship_detail
  );

  update public.clients
  set dni = coalesce(v_dni, dni),
      display_name = coalesce(
        v_display_name,
        concat_ws(' ', v_first_name, nullif(btrim(p_client ->> 'middle_name'), ''),
          v_paternal_surname, v_maternal_surname)
      )
  where id = v_client_id;
exception
  when unique_violation then
    raise exception 'El DNI ya pertenece a otro cliente.';
end;
$$;

create or replace function public.list_referral_inbox(
  p_page integer default 1,
  p_limit integer default 10,
  p_search text default '',
  p_area_id uuid default null
)
returns table (
  id uuid, attention_id uuid, rac_code text, client_dni text, client_name text,
  destination_area_id uuid, destination_area_name text, referred_by_name text,
  referred_at timestamptz, total_count bigint
)
language plpgsql security definer stable set search_path = public
as $$
declare v_is_admin boolean := public.is_admin(); v_user_area uuid;
begin
  if auth.uid() is null or public.is_active_tablet_session() then
    raise exception 'No tienes permiso para consultar el buzon.';
  end if;
  select p.area_id into v_user_area from public.profiles p
  where p.id = auth.uid() and p.status = 'active';
  if not v_is_admin and v_user_area is null then return; end if;

  return query
  select ar.id, ca.id, ca.rac_code, c.dni, c.display_name,
    ar.destination_area_id, ar.destination_area_name, ar.referred_by_name,
    ar.referred_at, count(*) over()
  from public.attention_referrals ar
  join public.customer_attentions ca on ca.id = ar.attention_id and ca.status = 'ACTIVE'
  join public.clients c on c.id = ca.client_id
  where ar.status = 'PENDING'
    and (v_is_admin or ar.destination_area_id = v_user_area)
    and (not v_is_admin or p_area_id is null or ar.destination_area_id = p_area_id)
    and (coalesce(btrim(p_search), '') = ''
      or ca.rac_code ilike '%' || btrim(p_search) || '%'
      or c.display_name ilike '%' || btrim(p_search) || '%'
      or c.email ilike '%' || btrim(p_search) || '%'
      or (regexp_replace(p_search, '[^0-9]', '', 'g') <> ''
        and c.dni ilike '%' || regexp_replace(p_search, '[^0-9]', '', 'g') || '%'))
  order by ar.referred_at
  limit greatest(1, least(coalesce(p_limit, 10), 100))
  offset (greatest(coalesce(p_page, 1), 1) - 1) * greatest(1, least(coalesce(p_limit, 10), 100));
end;
$$;

create or replace function public.list_customer_attentions_v2(
  p_page integer default 1,
  p_limit integer default 10,
  p_search text default '',
  p_survey_status text default null,
  p_referral_status text default null,
  p_area_id uuid default null
)
returns table (
  id uuid, rac_code text, attention_status text, requester_type text,
  client_dni text, client_name text, service_channel_name text,
  created_by_name text, created_at timestamptz, survey_status text,
  referral_status text, referral_area_id uuid, referral_area_name text,
  total_count bigint
)
language plpgsql security definer stable set search_path = public
as $$
declare v_is_admin boolean := public.is_admin();
begin
  if auth.uid() is null or public.is_active_tablet_session() then
    raise exception 'No tienes permiso para consultar atenciones.';
  end if;
  return query
  select ca.id, ca.rac_code, ca.status, ca.requester_type, c.dni, c.display_name,
    sc.name, ca.created_by_name, ca.created_at, coalesce(s.status, 'NONE'),
    coalesce(ar.status, 'NONE'), ar.destination_area_id, ar.destination_area_name,
    count(*) over()
  from public.customer_attentions ca
  join public.clients c on c.id = ca.client_id
  join public.service_channels sc on sc.id = ca.service_channel_id
  left join public.attention_surveys s on s.attention_id = ca.id
  left join public.attention_referrals ar on ar.attention_id = ca.id
  where (ca.status = 'ACTIVE' or v_is_admin)
    and (coalesce(btrim(p_search), '') = ''
      or ca.rac_code ilike '%' || btrim(p_search) || '%'
      or c.display_name ilike '%' || btrim(p_search) || '%'
      or c.email ilike '%' || btrim(p_search) || '%'
      or (regexp_replace(p_search, '[^0-9]', '', 'g') <> ''
        and c.dni ilike '%' || regexp_replace(p_search, '[^0-9]', '', 'g') || '%'))
    and (p_survey_status is null or coalesce(s.status, 'NONE') = p_survey_status)
    and (p_referral_status is null or coalesce(ar.status, 'NONE') = p_referral_status)
    and (p_area_id is null or ar.destination_area_id = p_area_id)
  order by ca.created_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 100))
  offset (greatest(coalesce(p_page, 1), 1) - 1) * greatest(1, least(coalesce(p_limit, 10), 100));
end;
$$;

revoke execute on function public.create_customer_attention_v2(
  jsonb, uuid, text, text, jsonb, text, uuid, uuid, text, text
) from public, anon;
revoke execute on function public.update_customer_attention_v2(
  uuid, jsonb, uuid, text, text, jsonb, uuid, uuid, text, text
) from public, anon;

grant execute on function public.create_customer_attention_v2(
  jsonb, uuid, text, text, jsonb, text, uuid, uuid, text, text
) to authenticated;
grant execute on function public.update_customer_attention_v2(
  uuid, jsonb, uuid, text, text, jsonb, uuid, uuid, text, text
) to authenticated;

notify pgrst, 'reload schema';
commit;

