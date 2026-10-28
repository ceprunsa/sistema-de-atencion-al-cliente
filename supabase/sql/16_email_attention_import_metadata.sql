-- Etapa 1: metadatos de atenciones por correo e importacion desde Gmail.
-- Ejecutar despues de 15_dashboard_attention_trend.sql.
begin;

create or replace function public.is_valid_email_attachment_metadata(p_value jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
begin
  if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > 50 then
    return false;
  end if;

  for v_item in select value from jsonb_array_elements(p_value)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or nullif(btrim(v_item ->> 'name'), '') is null
      or length(v_item ->> 'name') > 255
      or (v_item ? 'sizeLabel' and (
        jsonb_typeof(v_item -> 'sizeLabel') not in ('string', 'null')
        or length(coalesce(v_item ->> 'sizeLabel', '')) > 100
      ))
      or (v_item ? 'typeLabel' and (
        jsonb_typeof(v_item -> 'typeLabel') not in ('string', 'null')
        or length(coalesce(v_item ->> 'typeLabel', '')) > 100
      ))
      or v_item - 'name' - 'sizeLabel' - 'typeLabel' <> '{}'::jsonb then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

alter table public.customer_attentions
  add column if not exists creation_origin text not null default 'WEB',
  add column if not exists email_received_at timestamptz,
  add column if not exists email_responded_at timestamptz,
  add column if not exists email_original_text text,
  add column if not exists email_attachments jsonb not null default '[]'::jsonb,
  add column if not exists source_message_key_hash text,
  add column if not exists source_fingerprint text;

alter table public.customer_attentions
  drop constraint if exists customer_attentions_creation_origin_check,
  drop constraint if exists customer_attentions_email_dates_check,
  drop constraint if exists customer_attentions_email_original_text_check,
  drop constraint if exists customer_attentions_email_attachments_check,
  drop constraint if exists customer_attentions_source_hashes_check,
  drop constraint if exists customer_attentions_gmail_origin_check;

alter table public.customer_attentions
  add constraint customer_attentions_creation_origin_check
    check (creation_origin in ('WEB', 'GMAIL_CHROME_EXTENSION')),
  add constraint customer_attentions_email_dates_check check (
    email_responded_at is null
    or (email_received_at is not null and email_responded_at >= email_received_at)
  ),
  add constraint customer_attentions_email_original_text_check check (
    email_original_text is null
    or (nullif(btrim(email_original_text), '') is not null and length(email_original_text) <= 500000)
  ),
  add constraint customer_attentions_email_attachments_check
    check (public.is_valid_email_attachment_metadata(email_attachments)),
  add constraint customer_attentions_source_hashes_check check (
    (source_message_key_hash is null or source_message_key_hash ~ '^[0-9a-f]{64}$')
    and (source_fingerprint is null or source_fingerprint ~ '^[0-9a-f]{64}$')
  ),
  add constraint customer_attentions_gmail_origin_check check (
    creation_origin <> 'GMAIL_CHROME_EXTENSION'
    or (
      email_received_at is not null
      and email_original_text is not null
      and source_fingerprint is not null
    )
  );

create index if not exists customer_attentions_source_message_key_hash_idx
  on public.customer_attentions (source_message_key_hash)
  where source_message_key_hash is not null;
create index if not exists customer_attentions_source_fingerprint_idx
  on public.customer_attentions (source_fingerprint)
  where source_fingerprint is not null;

create or replace function public.create_customer_attention_v4(
  p_client jsonb,
  p_service_channel_id uuid,
  p_requester_type text,
  p_conclusion text,
  p_topics jsonb,
  p_client_contact_email text,
  p_admission_process_ids jsonb,
  p_kinship_type_id uuid default null,
  p_destination_area_id uuid default null,
  p_requester_detail text default null,
  p_kinship_detail text default null,
  p_creation_origin text default 'WEB',
  p_email_received_at timestamptz default null,
  p_email_responded_at timestamptz default null,
  p_email_original_text text default null,
  p_email_attachments jsonb default '[]'::jsonb,
  p_source_message_key_hash text default null,
  p_source_fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_attention_id uuid;
  v_category text;
  v_origin text := upper(coalesce(nullif(btrim(p_creation_origin), ''), 'WEB'));
  v_original_text text := nullif(btrim(p_email_original_text), '');
  v_attachments jsonb := coalesce(p_email_attachments, '[]'::jsonb);
  v_message_key_hash text := lower(nullif(btrim(p_source_message_key_hash), ''));
  v_fingerprint text := lower(nullif(btrim(p_source_fingerprint), ''));
begin
  select sc.category into v_category
  from public.service_channels sc
  where sc.id = p_service_channel_id and sc.is_active;

  if not found or v_category is null then
    raise exception 'Selecciona un medio de atencion activo y clasificado.';
  end if;
  if v_origin not in ('WEB', 'GMAIL_CHROME_EXTENSION') then
    raise exception 'El origen de la atencion no es valido.';
  end if;
  if not public.is_valid_email_attachment_metadata(v_attachments) then
    raise exception 'Los metadatos de adjuntos no son validos.';
  end if;
  if v_message_key_hash is not null and v_message_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'El identificador seguro del mensaje no es valido.';
  end if;
  if v_fingerprint is not null and v_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'La huella del mensaje no es valida.';
  end if;
  if v_original_text is not null and length(v_original_text) > 500000 then
    raise exception 'El mensaje original excede el limite permitido.';
  end if;

  if v_category = 'EMAIL' then
    if p_email_received_at is null then
      raise exception 'La fecha de recepcion del correo es obligatoria.';
    end if;
    if p_email_received_at > now() + interval '5 minutes' then
      raise exception 'La fecha de recepcion no puede estar en el futuro.';
    end if;
    if v_original_text is null then
      raise exception 'El asunto o cuerpo original del correo es obligatorio.';
    end if;
    if p_email_responded_at is not null and (
      p_email_responded_at < p_email_received_at
      or p_email_responded_at > now() + interval '5 minutes'
    ) then
      raise exception 'La fecha de respuesta no es valida.';
    end if;
  elsif p_email_received_at is not null
    or p_email_responded_at is not null
    or v_original_text is not null
    or jsonb_array_length(v_attachments) > 0
    or v_message_key_hash is not null
    or v_fingerprint is not null
    or v_origin = 'GMAIL_CHROME_EXTENSION' then
    raise exception 'Los metadatos de correo solo corresponden a medios de categoria EMAIL.';
  end if;

  if v_origin = 'GMAIL_CHROME_EXTENSION' and v_fingerprint is null then
    raise exception 'La importacion desde Gmail requiere una huella del mensaje.';
  end if;
  if v_origin <> 'GMAIL_CHROME_EXTENSION'
    and (v_message_key_hash is not null or v_fingerprint is not null) then
    raise exception 'Las huellas de origen solo corresponden a una importacion desde Gmail.';
  end if;

  select public.create_customer_attention_v3(
    p_client, p_service_channel_id, p_requester_type, p_conclusion, p_topics,
    p_client_contact_email, p_admission_process_ids, p_kinship_type_id,
    p_destination_area_id, p_requester_detail, p_kinship_detail
  ) into v_result;

  v_attention_id := (v_result ->> 'id')::uuid;
  update public.customer_attentions
  set creation_origin = v_origin,
      email_received_at = case when v_category = 'EMAIL' then p_email_received_at else null end,
      email_responded_at = case when v_category = 'EMAIL' then p_email_responded_at else null end,
      email_original_text = case when v_category = 'EMAIL' then v_original_text else null end,
      email_attachments = case when v_category = 'EMAIL' then v_attachments else '[]'::jsonb end,
      source_message_key_hash = v_message_key_hash,
      source_fingerprint = v_fingerprint
  where id = v_attention_id;

  return v_result;
end;
$$;

create or replace function public.update_customer_attention_v4(
  p_attention_id uuid,
  p_client jsonb,
  p_service_channel_id uuid,
  p_requester_type text,
  p_conclusion text,
  p_topics jsonb,
  p_admission_process_ids jsonb,
  p_kinship_type_id uuid default null,
  p_destination_area_id uuid default null,
  p_requester_detail text default null,
  p_kinship_detail text default null,
  p_email_received_at timestamptz default null,
  p_email_responded_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_category text;
  v_origin text;
  v_original_text text;
  v_has_email_metadata boolean;
begin
  select sc.category into v_category
  from public.service_channels sc
  where sc.id = p_service_channel_id;
  if not found or v_category is null then
    raise exception 'El medio de atencion no tiene una categoria configurada.';
  end if;

  select ca.creation_origin, ca.email_original_text,
    ca.email_received_at is not null
      or ca.email_original_text is not null
      or jsonb_array_length(ca.email_attachments) > 0
  into v_origin, v_original_text, v_has_email_metadata
  from public.customer_attentions ca
  where ca.id = p_attention_id;
  if not found then raise exception 'La atencion no existe.'; end if;

  if v_origin = 'GMAIL_CHROME_EXTENSION' and v_category <> 'EMAIL' then
    raise exception 'Una atencion importada desde Gmail debe conservar un medio de correo.';
  end if;
  if v_category <> 'EMAIL' and (
    v_has_email_metadata or p_email_received_at is not null or p_email_responded_at is not null
  ) then
    raise exception 'No se puede cambiar a otro medio una atencion que conserva datos de correo.';
  end if;
  if v_category = 'EMAIL' then
    if p_email_received_at is null and v_original_text is not null then
      raise exception 'La fecha de recepcion del correo es obligatoria.';
    end if;
    if p_email_received_at is not null and p_email_received_at > now() + interval '5 minutes' then
      raise exception 'La fecha de recepcion no puede estar en el futuro.';
    end if;
    if p_email_responded_at is not null and (
      p_email_received_at is null
      or p_email_responded_at < p_email_received_at
      or p_email_responded_at > now() + interval '5 minutes'
    ) then
      raise exception 'La fecha de respuesta no es valida.';
    end if;
  end if;

  perform public.update_customer_attention_v3(
    p_attention_id, p_client, p_service_channel_id, p_requester_type,
    p_conclusion, p_topics, p_admission_process_ids, p_kinship_type_id,
    p_destination_area_id, p_requester_detail, p_kinship_detail
  );

  if v_category = 'EMAIL' then
    update public.customer_attentions
    set email_received_at = p_email_received_at,
        email_responded_at = p_email_responded_at
    where id = p_attention_id;
  end if;
end;
$$;

create or replace function public.set_email_attention_response_at(
  p_attention_id uuid,
  p_responded_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_name text;
  v_is_admin boolean := public.is_admin();
  v_created_by uuid;
  v_status text;
  v_category text;
  v_received_at timestamptz;
  v_current_response_at timestamptz;
begin
  if v_user_id is null or public.is_active_tablet_session() then
    raise exception 'No hay una sesion de usuario valida.';
  end if;
  select concat_ws(' ', p.first_name, nullif(p.middle_name, ''), p.paternal_surname, p.maternal_surname)
  into v_actor_name
  from public.profiles p
  where p.id = v_user_id and p.status = 'active';
  if not found then raise exception 'El usuario no tiene un perfil activo.'; end if;

  select ca.created_by, ca.status, sc.category, ca.email_received_at, ca.email_responded_at
  into v_created_by, v_status, v_category, v_received_at, v_current_response_at
  from public.customer_attentions ca
  join public.service_channels sc on sc.id = ca.service_channel_id
  where ca.id = p_attention_id
  for update of ca;
  if not found then raise exception 'La atencion no existe.'; end if;
  if v_status <> 'ACTIVE' then raise exception 'La atencion no esta activa.'; end if;
  if v_category <> 'EMAIL' then raise exception 'La atencion no corresponde a un medio de correo.'; end if;
  if not v_is_admin and v_created_by is distinct from v_user_id then
    raise exception 'No tienes permiso para registrar la respuesta de esta atencion.';
  end if;
  if p_responded_at is null then
    if not v_is_admin then raise exception 'Solo un administrador puede borrar la fecha de respuesta.'; end if;
  else
    if v_received_at is null then raise exception 'Primero registra la fecha de recepcion del correo.'; end if;
    if p_responded_at < v_received_at or p_responded_at > now() + interval '5 minutes' then
      raise exception 'La fecha de respuesta no es valida.';
    end if;
    if v_current_response_at is not null and not v_is_admin then
      raise exception 'La fecha de respuesta ya fue registrada; solicita su correccion a un administrador.';
    end if;
  end if;

  update public.customer_attentions
  set email_responded_at = p_responded_at,
      updated_by = v_user_id,
      updated_by_name = v_actor_name
  where id = p_attention_id;
end;
$$;

create or replace function public.find_email_attention_duplicates(
  p_source_message_key_hash text default null,
  p_source_fingerprint text default null
)
returns table (
  id uuid,
  rac_code text,
  created_at timestamptz,
  match_type text
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_key text := lower(nullif(btrim(p_source_message_key_hash), ''));
  v_fingerprint text := lower(nullif(btrim(p_source_fingerprint), ''));
  v_user_area_id uuid;
begin
  if v_user_id is null or public.is_active_tablet_session() then
    raise exception 'No hay una sesion de usuario valida.';
  end if;
  if v_key is null and v_fingerprint is null then return; end if;
  if (v_key is not null and v_key !~ '^[0-9a-f]{64}$')
    or (v_fingerprint is not null and v_fingerprint !~ '^[0-9a-f]{64}$') then
    raise exception 'La huella consultada no es valida.';
  end if;
  select p.area_id into v_user_area_id
  from public.profiles p
  where p.id = v_user_id and p.status = 'active';
  if not found then raise exception 'El usuario no tiene un perfil activo.'; end if;

  return query
  select ca.id, ca.rac_code, ca.created_at,
    case when v_key is not null and ca.source_message_key_hash = v_key
      then 'MESSAGE_KEY' else 'FINGERPRINT' end
  from public.customer_attentions ca
  left join public.attention_referrals ar on ar.attention_id = ca.id
  where (ca.status = 'ACTIVE' or public.is_admin())
    and (
      (v_key is not null and ca.source_message_key_hash = v_key)
      or (v_fingerprint is not null and ca.source_fingerprint = v_fingerprint)
    )
    and (
      public.is_admin()
      or ca.created_by = v_user_id
      or ar.destination_area_id = v_user_area_id
    )
  order by ca.created_at desc
  limit 10;
end;
$$;

revoke execute on function public.is_valid_email_attachment_metadata(jsonb)
from public, anon;
revoke execute on function public.create_customer_attention_v4(
  jsonb, uuid, text, text, jsonb, text, jsonb, uuid, uuid, text, text,
  text, timestamptz, timestamptz, text, jsonb, text, text
) from public, anon;
revoke execute on function public.update_customer_attention_v4(
  uuid, jsonb, uuid, text, text, jsonb, jsonb, uuid, uuid, text, text,
  timestamptz, timestamptz
) from public, anon;
revoke execute on function public.set_email_attention_response_at(uuid, timestamptz)
from public, anon;
revoke execute on function public.find_email_attention_duplicates(text, text)
from public, anon;

grant execute on function public.create_customer_attention_v4(
  jsonb, uuid, text, text, jsonb, text, jsonb, uuid, uuid, text, text,
  text, timestamptz, timestamptz, text, jsonb, text, text
) to authenticated;
grant execute on function public.is_valid_email_attachment_metadata(jsonb)
to authenticated;
grant execute on function public.update_customer_attention_v4(
  uuid, jsonb, uuid, text, text, jsonb, jsonb, uuid, uuid, text, text,
  timestamptz, timestamptz
) to authenticated;
grant execute on function public.set_email_attention_response_at(uuid, timestamptz)
to authenticated;
grant execute on function public.find_email_attention_duplicates(text, text)
to authenticated;

notify pgrst, 'reload schema';
commit;
