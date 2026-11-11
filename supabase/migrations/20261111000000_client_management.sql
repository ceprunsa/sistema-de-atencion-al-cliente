-- Gestion administrativa de clientes y busquedas operativas limitadas.
-- Aplicar junto con el frontend que consume las RPC de identificacion.
begin;

create or replace function public.normalize_client_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.dni := nullif(btrim(new.dni), '');
  new.display_name := nullif(btrim(new.display_name), '');
  new.first_name := nullif(btrim(new.first_name), '');
  new.middle_name := nullif(btrim(new.middle_name), '');
  new.paternal_surname := nullif(btrim(new.paternal_surname), '');
  new.maternal_surname := nullif(btrim(new.maternal_surname), '');
  new.email := lower(nullif(btrim(new.email), ''));
  new.phone := nullif(btrim(new.phone), '');
  return new;
end;
$$;

drop trigger if exists clients_normalize_fields on public.clients;
create trigger clients_normalize_fields
before insert or update on public.clients
for each row execute function public.normalize_client_fields();

alter table public.clients
  drop constraint if exists clients_email_format_check;
alter table public.clients
  add constraint clients_email_format_check
  check (
    email is null
    or (
      email = lower(btrim(email))
      and length(email) <= 254
      and email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$'
    )
  ) not valid;

alter table public.clients
  drop constraint if exists clients_identity_completeness_check;
alter table public.clients
  add constraint clients_identity_completeness_check
  check (
    (
      dni is not null
      and nullif(btrim(first_name), '') is not null
      and nullif(btrim(paternal_surname), '') is not null
      and nullif(btrim(maternal_surname), '') is not null
    )
    or (dni is null and email is not null)
  ) not valid;

create or replace function public.can_manage_clients()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and not public.is_active_tablet_session()
    and public.is_admin()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
    );
$$;

alter function public.can_manage_clients() owner to postgres;

create or replace function public.can_identify_clients()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and not public.is_active_tablet_session()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
    );
$$;

alter function public.can_identify_clients() owner to postgres;

create or replace function public.find_client_by_exact_dni(
  p_dni text
)
returns table (
  id uuid, dni text, display_name text, first_name text, middle_name text,
  paternal_surname text, maternal_surname text, email text, phone text,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql security definer stable set search_path = public, pg_temp
as $$
declare v_dni text := btrim(coalesce(p_dni, ''));
begin
  if not public.can_identify_clients() then
    raise exception 'No tienes permiso para identificar clientes.' using errcode = '42501';
  end if;
  if v_dni !~ '^[0-9]{8}$' then
    raise exception 'El DNI debe contener exactamente 8 digitos.';
  end if;
  return query
  select c.id, c.dni, c.display_name, c.first_name, c.middle_name,
    c.paternal_surname, c.maternal_surname, c.email, c.phone,
    c.created_at, c.updated_at
  from public.clients c where c.dni = v_dni limit 1;
end;
$$;

create or replace function public.find_clients_by_exact_email(
  p_email text
)
returns table (
  id uuid, dni text, display_name text, first_name text, middle_name text,
  paternal_surname text, maternal_surname text, email text, phone text,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql security definer stable set search_path = public, pg_temp
as $$
declare v_email text := lower(nullif(btrim(p_email), ''));
begin
  if not public.can_identify_clients() then
    raise exception 'No tienes permiso para identificar clientes.' using errcode = '42501';
  end if;
  if v_email is null or length(v_email) > 254
    or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$' then
    raise exception 'El correo electronico no es valido.';
  end if;
  return query
  select c.id, c.dni, c.display_name, c.first_name, c.middle_name,
    c.paternal_surname, c.maternal_surname, c.email, c.phone,
    c.created_at, c.updated_at
  from public.clients c
  where lower(btrim(c.email)) = v_email
  order by c.updated_at desc, c.id limit 25;
end;
$$;

create or replace function public.get_client_for_attention(p_attention_id uuid)
returns table (
  id uuid, dni text, display_name text, first_name text, middle_name text,
  paternal_surname text, maternal_surname text, email text, phone text,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql security definer stable set search_path = public, pg_temp
as $$
begin
  if not public.can_identify_clients()
    or not public.can_view_attention_admission_processes(p_attention_id) then
    raise exception 'No tienes permiso para consultar el cliente de esta atencion.' using errcode = '42501';
  end if;
  return query
  select c.id, c.dni, c.display_name, c.first_name, c.middle_name,
    c.paternal_surname, c.maternal_surname, c.email, c.phone,
    c.created_at, c.updated_at
  from public.customer_attentions ca
  join public.clients c on c.id = ca.client_id
  where ca.id = p_attention_id;
end;
$$;

create or replace function public.list_clients_admin(
  p_page integer default 1, p_limit integer default 10, p_search text default ''
)
returns table (
  id uuid, dni text, display_name text, first_name text, middle_name text,
  paternal_surname text, maternal_surname text, email text, phone text,
  created_at timestamptz, updated_at timestamptz,
  attention_count bigint, total_count bigint
)
language plpgsql security definer stable set search_path = public, pg_temp
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 100));
  v_search text := btrim(coalesce(p_search, ''));
  v_digits text := regexp_replace(coalesce(p_search, ''), '[^0-9]', '', 'g');
begin
  if not public.can_manage_clients() then
    raise exception 'Solo un administrador puede consultar clientes.' using errcode = '42501';
  end if;
  return query
  select c.id, c.dni, c.display_name, c.first_name, c.middle_name,
    c.paternal_surname, c.maternal_surname, c.email, c.phone,
    c.created_at, c.updated_at,
    (select count(*) from public.customer_attentions ca where ca.client_id = c.id),
    count(*) over()
  from public.clients c
  where v_search = ''
    or (v_digits <> '' and c.dni ilike '%' || v_digits || '%')
    or c.display_name ilike '%' || v_search || '%'
    or coalesce(c.first_name, '') ilike '%' || v_search || '%'
    or coalesce(c.middle_name, '') ilike '%' || v_search || '%'
    or coalesce(c.paternal_surname, '') ilike '%' || v_search || '%'
    or coalesce(c.maternal_surname, '') ilike '%' || v_search || '%'
  order by c.paternal_surname nulls last, c.maternal_surname nulls last,
    c.first_name nulls last, c.display_name, c.id
  limit v_limit offset (v_page - 1) * v_limit;
end;
$$;

create or replace function public.get_client_admin(p_client_id uuid)
returns table (
  id uuid, dni text, display_name text, first_name text, middle_name text,
  paternal_surname text, maternal_surname text, email text, phone text,
  created_by uuid, created_at timestamptz, updated_at timestamptz,
  attention_count bigint
)
language plpgsql security definer stable set search_path = public, pg_temp
as $$
begin
  if not public.can_manage_clients() then
    raise exception 'Solo un administrador puede consultar clientes.' using errcode = '42501';
  end if;
  return query
  select c.id, c.dni, c.display_name, c.first_name, c.middle_name,
    c.paternal_surname, c.maternal_surname, c.email, c.phone,
    c.created_by, c.created_at, c.updated_at,
    (select count(*) from public.customer_attentions ca where ca.client_id = c.id)
  from public.clients c where c.id = p_client_id;
end;
$$;

create or replace function public.create_client_admin(p_client jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_dni text; v_display_name text; v_first_name text; v_middle_name text;
  v_paternal_surname text; v_maternal_surname text; v_email text; v_phone text;
  v_client public.clients%rowtype;
begin
  if not public.can_manage_clients() then
    raise exception 'Solo un administrador puede crear clientes.' using errcode = '42501';
  end if;
  if p_client is null or jsonb_typeof(p_client) <> 'object' then
    raise exception 'Los datos del cliente no son validos.';
  end if;
  v_dni := nullif(btrim(p_client ->> 'dni'), '');
  v_first_name := nullif(btrim(p_client ->> 'first_name'), '');
  v_middle_name := nullif(btrim(p_client ->> 'middle_name'), '');
  v_paternal_surname := nullif(btrim(p_client ->> 'paternal_surname'), '');
  v_maternal_surname := nullif(btrim(p_client ->> 'maternal_surname'), '');
  v_email := lower(nullif(btrim(p_client ->> 'email'), ''));
  v_phone := nullif(btrim(p_client ->> 'phone'), '');
  v_display_name := coalesce(nullif(btrim(p_client ->> 'display_name'), ''),
    nullif(concat_ws(' ', v_first_name, v_middle_name, v_paternal_surname, v_maternal_surname), ''));
  if v_dni is not null and v_dni !~ '^[0-9]{8}$' then raise exception 'El DNI debe contener exactamente 8 digitos.'; end if;
  if v_display_name is null or length(v_display_name) > 250 then raise exception 'El nombre o denominacion del cliente es obligatorio y admite hasta 250 caracteres.'; end if;
  if v_email is not null and (length(v_email) > 254 or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$') then raise exception 'El correo electronico no es valido.'; end if;
  if v_dni is not null and (v_first_name is null or v_paternal_surname is null or v_maternal_surname is null) then raise exception 'Un cliente con DNI debe tener primer nombre y ambos apellidos.'; end if;
  if v_dni is null and v_email is null then raise exception 'Un cliente sin DNI debe tener correo electronico.'; end if;
  if v_dni is not null and exists (select 1 from public.clients c where c.dni = v_dni) then raise exception 'Ya existe un cliente con ese DNI.' using errcode = '23505'; end if;
  insert into public.clients (dni, display_name, first_name, middle_name, paternal_surname, maternal_surname, email, phone, created_by)
  values (v_dni, v_display_name, v_first_name, v_middle_name, v_paternal_surname, v_maternal_surname, v_email, v_phone, auth.uid()) returning * into v_client;
  return jsonb_build_object('id', v_client.id, 'dni', v_client.dni, 'display_name', v_client.display_name,
    'first_name', v_client.first_name, 'middle_name', v_client.middle_name,
    'paternal_surname', v_client.paternal_surname, 'maternal_surname', v_client.maternal_surname,
    'email', v_client.email, 'phone', v_client.phone,
    'created_at', v_client.created_at, 'updated_at', v_client.updated_at);
exception when unique_violation then
  raise exception 'Ya existe un cliente con ese DNI.' using errcode = '23505';
end;
$$;

create or replace function public.update_client_admin(
  p_client_id uuid, p_client jsonb, p_confirm_dni_change boolean default false
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_current public.clients%rowtype; v_saved public.clients%rowtype;
  v_dni text; v_display_name text; v_first_name text; v_middle_name text;
  v_paternal_surname text; v_maternal_surname text; v_email text; v_phone text;
begin
  if not public.can_manage_clients() then raise exception 'Solo un administrador puede editar clientes.' using errcode = '42501'; end if;
  if p_client is null or jsonb_typeof(p_client) <> 'object' then raise exception 'Los datos del cliente no son validos.'; end if;
  select * into v_current from public.clients c where c.id = p_client_id for update;
  if not found then raise exception 'El cliente no existe.' using errcode = 'P0002'; end if;
  v_dni := case when p_client ? 'dni' then nullif(btrim(p_client ->> 'dni'), '') else v_current.dni end;
  v_first_name := case when p_client ? 'first_name' then nullif(btrim(p_client ->> 'first_name'), '') else v_current.first_name end;
  v_middle_name := case when p_client ? 'middle_name' then nullif(btrim(p_client ->> 'middle_name'), '') else v_current.middle_name end;
  v_paternal_surname := case when p_client ? 'paternal_surname' then nullif(btrim(p_client ->> 'paternal_surname'), '') else v_current.paternal_surname end;
  v_maternal_surname := case when p_client ? 'maternal_surname' then nullif(btrim(p_client ->> 'maternal_surname'), '') else v_current.maternal_surname end;
  v_email := case when p_client ? 'email' then lower(nullif(btrim(p_client ->> 'email'), '')) else v_current.email end;
  v_phone := case when p_client ? 'phone' then nullif(btrim(p_client ->> 'phone'), '') else v_current.phone end;
  v_display_name := case when p_client ? 'display_name' then nullif(btrim(p_client ->> 'display_name'), '') else v_current.display_name end;
  v_display_name := coalesce(v_display_name, nullif(concat_ws(' ', v_first_name, v_middle_name, v_paternal_surname, v_maternal_surname), ''));
  if v_current.dni is not null and v_dni is null then raise exception 'No se puede eliminar un DNI ya registrado.'; end if;
  if v_current.dni is not null and v_dni is distinct from v_current.dni and not coalesce(p_confirm_dni_change, false) then raise exception 'Confirma expresamente la correccion del DNI.' using errcode = '22023'; end if;
  if v_dni is not null and v_dni !~ '^[0-9]{8}$' then raise exception 'El DNI debe contener exactamente 8 digitos.'; end if;
  if v_display_name is null or length(v_display_name) > 250 then raise exception 'El nombre o denominacion del cliente es obligatorio y admite hasta 250 caracteres.'; end if;
  if v_email is not null and (length(v_email) > 254 or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$') then raise exception 'El correo electronico no es valido.'; end if;
  if v_dni is not null and (v_first_name is null or v_paternal_surname is null or v_maternal_surname is null) then raise exception 'Un cliente con DNI debe tener primer nombre y ambos apellidos.'; end if;
  if v_dni is null and v_email is null then raise exception 'Un cliente sin DNI debe tener correo electronico.'; end if;
  if v_dni is not null and exists (select 1 from public.clients c where c.dni = v_dni and c.id <> p_client_id) then raise exception 'Ya existe otro cliente con ese DNI.' using errcode = '23505'; end if;
  update public.clients set dni = v_dni, display_name = v_display_name, first_name = v_first_name,
    middle_name = v_middle_name, paternal_surname = v_paternal_surname,
    maternal_surname = v_maternal_surname, email = v_email, phone = v_phone
  where id = p_client_id returning * into v_saved;
  return jsonb_build_object('id', v_saved.id, 'dni', v_saved.dni, 'display_name', v_saved.display_name,
    'first_name', v_saved.first_name, 'middle_name', v_saved.middle_name,
    'paternal_surname', v_saved.paternal_surname, 'maternal_surname', v_saved.maternal_surname,
    'email', v_saved.email, 'phone', v_saved.phone,
    'created_at', v_saved.created_at, 'updated_at', v_saved.updated_at);
exception when unique_violation then
  raise exception 'Ya existe otro cliente con ese DNI.' using errcode = '23505';
end;
$$;

create or replace function public.list_client_attentions_admin(
  p_client_id uuid, p_page integer default 1, p_limit integer default 10
)
returns table (
  id uuid, rac_code text, attention_status text, requester_type text,
  service_channel_name text, created_by_name text, created_at timestamptz,
  referral_status text, referral_area_name text, total_count bigint
)
language plpgsql security definer stable set search_path = public, pg_temp
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 100));
begin
  if not public.can_manage_clients() then raise exception 'Solo un administrador puede consultar el historial del cliente.' using errcode = '42501'; end if;
  return query
  select ca.id, ca.rac_code, ca.status, ca.requester_type, sc.name,
    ca.created_by_name, ca.created_at, coalesce(ar.status, 'NONE'),
    ar.destination_area_name, count(*) over()
  from public.customer_attentions ca
  join public.service_channels sc on sc.id = ca.service_channel_id
  left join public.attention_referrals ar on ar.attention_id = ca.id
  where ca.client_id = p_client_id
  order by ca.created_at desc, ca.id
  limit v_limit offset (v_page - 1) * v_limit;
end;
$$;

drop policy if exists "clients_select_authenticated" on public.clients;
drop policy if exists "clients_select_admin" on public.clients;
create policy "clients_select_admin" on public.clients for select to authenticated
using (public.can_manage_clients());
drop policy if exists "clients_update_admin" on public.clients;
create policy "clients_update_admin" on public.clients for update to authenticated
using (public.can_manage_clients()) with check (public.can_manage_clients());

revoke insert, update, delete on public.clients from authenticated;
grant select on public.clients to authenticated;

revoke execute on function public.normalize_client_fields() from public, anon, authenticated;
revoke execute on function public.can_manage_clients() from public, anon;
revoke execute on function public.can_identify_clients() from public, anon;
revoke execute on function public.find_client_by_exact_dni(text) from public, anon;
revoke execute on function public.find_clients_by_exact_email(text) from public, anon;
revoke execute on function public.get_client_for_attention(uuid) from public, anon;
revoke execute on function public.list_clients_admin(integer, integer, text) from public, anon;
revoke execute on function public.get_client_admin(uuid) from public, anon;
revoke execute on function public.create_client_admin(jsonb) from public, anon;
revoke execute on function public.update_client_admin(uuid, jsonb, boolean) from public, anon;
revoke execute on function public.list_client_attentions_admin(uuid, integer, integer) from public, anon;
grant execute on function public.can_manage_clients() to authenticated;
grant execute on function public.can_identify_clients() to authenticated;
grant execute on function public.find_client_by_exact_dni(text) to authenticated;
grant execute on function public.find_clients_by_exact_email(text) to authenticated;
grant execute on function public.get_client_for_attention(uuid) to authenticated;
grant execute on function public.list_clients_admin(integer, integer, text) to authenticated;
grant execute on function public.get_client_admin(uuid) to authenticated;
grant execute on function public.create_client_admin(jsonb) to authenticated;
grant execute on function public.update_client_admin(uuid, jsonb, boolean) to authenticated;
grant execute on function public.list_client_attentions_admin(uuid, integer, integer) to authenticated;

notify pgrst, 'reload schema';
commit;
