-- Etapa 18: eliminar el nombre del personal delegado y actualizar el contrato Gmail.
-- Ejecutar despues de 17_gmail_answered_exchange.sql.
begin;

do $$
declare
  v_function oid;
begin
  for v_function in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_customer_attention_v5'
  loop
    execute format('drop function %s', v_function::regprocedure);
  end loop;
end;
$$;

alter table public.customer_attentions
  drop constraint if exists customer_attentions_email_response_identity_check,
  drop constraint if exists customer_attentions_exchange_metadata_origin_check,
  drop column if exists email_response_delegate_name;

alter table public.customer_attentions
  add constraint customer_attentions_email_response_identity_check check (
    (email_response_mailbox_email is null or (
      length(email_response_mailbox_email) <= 254
      and email_response_mailbox_email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$'
    ))
    and (email_response_mailbox_name is null or (
      nullif(btrim(email_response_mailbox_name), '') is not null
      and length(email_response_mailbox_name) <= 250
    ))
    and (email_response_delegate_email is null or (
      length(email_response_delegate_email) <= 254
      and email_response_delegate_email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$'
    ))
    and (
      (email_response_is_delegated and email_response_delegate_email is not null)
      or (
        not email_response_is_delegated
        and email_response_delegate_email is null
      )
    )
  ),
  add constraint customer_attentions_exchange_metadata_origin_check check (
    (
      gmail_import_version is null
      and email_response_original_text is null
      and email_response_mailbox_email is null
      and email_response_mailbox_name is null
      and email_response_delegate_email is null
      and not email_response_is_delegated
      and email_received_at_source is null
      and email_responded_at_source is null
      and gmail_conversation_url is null
      and source_response_message_key_hash is null
      and source_exchange_fingerprint is null
    )
    or (
      gmail_import_version = 2
      and creation_origin = 'GMAIL_CHROME_EXTENSION'
      and email_received_at is not null
      and email_responded_at is not null
      and email_responded_at > email_received_at
      and email_original_text is not null
      and email_response_original_text is not null
      and email_response_mailbox_email is not null
      and email_received_at_source is not null
      and email_responded_at_source is not null
      and gmail_conversation_url is not null
      and source_message_key_hash is not null
      and source_response_message_key_hash is not null
      and source_exchange_fingerprint is not null
    )
  );

create or replace function public.create_customer_attention_v6(
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
  p_source_fingerprint text default null,
  p_gmail_import_version smallint default null,
  p_email_response_original_text text default null,
  p_email_response_mailbox_email text default null,
  p_email_response_mailbox_name text default null,
  p_email_response_delegate_email text default null,
  p_email_response_is_delegated boolean default false,
  p_email_received_at_source text default null,
  p_email_responded_at_source text default null,
  p_gmail_conversation_url text default null,
  p_source_response_message_key_hash text default null,
  p_source_exchange_fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_attention_id uuid;
  v_origin text := upper(coalesce(nullif(btrim(p_creation_origin), ''), 'WEB'));
  v_response_text text := nullif(btrim(p_email_response_original_text), '');
  v_mailbox_email text := lower(nullif(btrim(p_email_response_mailbox_email), ''));
  v_mailbox_name text := nullif(btrim(p_email_response_mailbox_name), '');
  v_delegate_email text := lower(nullif(btrim(p_email_response_delegate_email), ''));
  v_received_source text := nullif(btrim(p_email_received_at_source), '');
  v_responded_source text := nullif(btrim(p_email_responded_at_source), '');
  v_conversation_url text := nullif(btrim(p_gmail_conversation_url), '');
  v_response_key text := lower(nullif(btrim(p_source_response_message_key_hash), ''));
  v_exchange_fingerprint text := lower(nullif(btrim(p_source_exchange_fingerprint), ''));
begin
  if v_origin = 'GMAIL_CHROME_EXTENSION' and p_gmail_import_version is distinct from 2 then
    raise exception 'La importacion de un intercambio Gmail requiere la version 2.';
  end if;
  if p_gmail_import_version = 2 and v_origin <> 'GMAIL_CHROME_EXTENSION' then
    raise exception 'La version 2 solo corresponde a importaciones desde Gmail.';
  end if;

  if p_gmail_import_version = 2 then
    if p_email_received_at is null or p_email_responded_at is null then
      raise exception 'Las fechas de recepcion y respuesta son obligatorias.';
    end if;
    if p_email_responded_at <= p_email_received_at then
      raise exception 'La respuesta debe ser posterior a la recepcion.';
    end if;
    if p_email_received_at > now() + interval '5 minutes'
      or p_email_responded_at > now() + interval '5 minutes' then
      raise exception 'Las fechas del intercambio no pueden estar en el futuro.';
    end if;
    if v_response_text is null then
      raise exception 'El texto original de la respuesta es obligatorio.';
    end if;
    if length(v_response_text) > 500000 then
      raise exception 'La respuesta original excede el limite permitido.';
    end if;
    if v_mailbox_email is null
      or v_mailbox_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$' then
      raise exception 'No se pudo validar la identidad del buzon que respondio.';
    end if;
    if p_email_response_is_delegated and (
      v_delegate_email is null
      or v_delegate_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$'
    ) then
      raise exception 'La identidad del delegado es obligatoria para un buzon delegado.';
    end if;
    if not p_email_response_is_delegated and v_delegate_email is not null then
      raise exception 'La identidad delegada no corresponde a un buzon normal.';
    end if;
    if v_received_source is null or v_responded_source is null then
      raise exception 'Las fuentes de ambas fechas son obligatorias.';
    end if;
    if length(v_received_source) > 500 or length(v_responded_source) > 500 then
      raise exception 'La referencia de fecha excede el limite permitido.';
    end if;
    if v_conversation_url is null
      or length(v_conversation_url) > 2048
      or v_conversation_url !~ '^https://mail[.]google[.]com/' then
      raise exception 'La URL de la conversacion Gmail no es valida.';
    end if;
    if p_source_message_key_hash is null
      or p_source_message_key_hash !~ '^[0-9a-f]{64}$'
      or v_response_key is null
      or v_response_key !~ '^[0-9a-f]{64}$'
      or v_exchange_fingerprint is null
      or v_exchange_fingerprint !~ '^[0-9a-f]{64}$' then
      raise exception 'Las huellas verificadas del intercambio son obligatorias.';
    end if;
  end if;

  select public.create_customer_attention_v4(
    p_client, p_service_channel_id, p_requester_type, p_conclusion, p_topics,
    p_client_contact_email, p_admission_process_ids, p_kinship_type_id,
    p_destination_area_id, p_requester_detail, p_kinship_detail,
    p_creation_origin, p_email_received_at, p_email_responded_at,
    p_email_original_text, p_email_attachments, p_source_message_key_hash,
    p_source_fingerprint
  ) into v_result;

  v_attention_id := (v_result ->> 'id')::uuid;

  if p_gmail_import_version = 2 then
    update public.customer_attentions
    set gmail_import_version = 2,
        email_response_original_text = v_response_text,
        email_response_mailbox_email = v_mailbox_email,
        email_response_mailbox_name = v_mailbox_name,
        email_response_delegate_email = v_delegate_email,
        email_response_is_delegated = p_email_response_is_delegated,
        email_received_at_source = v_received_source,
        email_responded_at_source = v_responded_source,
        gmail_conversation_url = v_conversation_url,
        source_response_message_key_hash = v_response_key,
        source_exchange_fingerprint = v_exchange_fingerprint
    where id = v_attention_id;
  end if;

  return v_result;
end;
$$;

revoke execute on function public.create_customer_attention_v6(
  jsonb, uuid, text, text, jsonb, text, jsonb, uuid, uuid, text, text,
  text, timestamptz, timestamptz, text, jsonb, text, text, smallint,
  text, text, text, text, boolean, text, text, text, text, text
) from public, anon;

grant execute on function public.create_customer_attention_v6(
  jsonb, uuid, text, text, jsonb, text, jsonb, uuid, uuid, text, text,
  text, timestamptz, timestamptz, text, jsonb, text, text, smallint,
  text, text, text, text, boolean, text, text, text, text, text
) to authenticated;

notify pgrst, 'reload schema';
commit;

