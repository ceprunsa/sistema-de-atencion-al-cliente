-- Etapa 4 del modulo de quejas: gestion responsable y respuesta del cliente.
-- Ejecutar manualmente despues de 22_complaint_listing_detail.sql.
begin;

alter table public.email_outbox
  drop constraint if exists email_outbox_event_type_check,
  drop constraint if exists email_outbox_aggregate_type_check,
  drop constraint if exists email_outbox_template_key_check,
  drop constraint if exists email_outbox_check1,
  drop constraint if exists email_outbox_aggregate_event_check;

alter table public.email_outbox
  add constraint email_outbox_event_type_check check (event_type in (
    'REFERRAL_CREATED', 'ATTENTION_SURVEY', 'REFERRAL_RESOLVED',
    'COMPLAINT_CREATED', 'COMPLAINT_RESPONSE_REQUESTED',
    'COMPLAINT_CLOSURE_PENDING'
  )),
  add constraint email_outbox_aggregate_type_check check (aggregate_type in (
    'ATTENTION', 'REFERRAL', 'COMPLAINT'
  )),
  add constraint email_outbox_template_key_check check (template_key in (
    'REFERRAL_CREATED', 'ATTENTION_SURVEY', 'REFERRAL_RESOLVED',
    'COMPLAINT_CREATED', 'COMPLAINT_RESPONSE_REQUESTED',
    'COMPLAINT_CLOSURE_PENDING'
  )),
  add constraint email_outbox_aggregate_event_check check (
    (event_type = 'ATTENTION_SURVEY' and aggregate_type = 'ATTENTION')
    or
    (event_type in ('REFERRAL_CREATED', 'REFERRAL_RESOLVED')
      and aggregate_type = 'REFERRAL')
    or
    (event_type in (
      'COMPLAINT_CREATED', 'COMPLAINT_RESPONSE_REQUESTED',
      'COMPLAINT_CLOSURE_PENDING'
    )
      and aggregate_type = 'COMPLAINT')
  );

create or replace function public.start_complaint_management(
  p_complaint_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_complaint public.complaints%rowtype;
  v_actor_name text;
  v_actor_area_id uuid;
begin
  select c.* into v_complaint
  from public.complaints c
  where c.id = p_complaint_id
  for update;

  if not found then
    raise exception 'La queja no existe.' using errcode = 'P0002';
  end if;
  if not public.can_manage_responsible_complaint(p_complaint_id) then
    raise exception 'Solo el area responsable puede gestionar esta queja.'
      using errcode = '42501';
  end if;
  if v_complaint.status not in (
    'PENDING_MANAGEMENT', 'RETURNED_BY_CLIENT', 'RETURNED_BY_CLOSURE'
  ) then
    raise exception 'La queja no puede iniciar gestion desde su estado actual.';
  end if;

  select concat_ws(' ', p.first_name, nullif(p.middle_name, ''),
      p.paternal_surname, p.maternal_surname), p.area_id
  into v_actor_name, v_actor_area_id
  from public.profiles p
  where p.id = auth.uid() and p.status = 'active';

  update public.complaints
  set status = 'IN_MANAGEMENT'
  where id = p_complaint_id;

  insert into public.complaint_events (
    complaint_id, event_type, previous_status, new_status,
    actor_id, actor_name, actor_area_id, notes
  ) values (
    p_complaint_id, 'MANAGEMENT_STARTED', v_complaint.status, 'IN_MANAGEMENT',
    auth.uid(), v_actor_name, v_actor_area_id,
    'El area responsable inicio la gestion de la queja.'
  );

  return jsonb_build_object('status', 'IN_MANAGEMENT');
end;
$$;

alter function public.start_complaint_management(uuid) owner to postgres;

create or replace function public.submit_complaint_management(
  p_complaint_id uuid,
  p_proceeds boolean,
  p_analysis text,
  p_actions text,
  p_client_explanation text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_complaint public.complaints%rowtype;
  v_actor_name text;
  v_actor_area_id uuid;
  v_client_email text;
  v_version_number integer;
  v_action_version_id uuid;
  v_response_id uuid;
  v_response_token uuid := gen_random_uuid();
  v_outbox_id uuid := gen_random_uuid();
  v_explanation text := nullif(btrim(coalesce(p_client_explanation, '')), '');
begin
  if nullif(btrim(coalesce(p_analysis, '')), '') is null then
    raise exception 'El analisis de la queja es obligatorio.';
  end if;
  if nullif(btrim(coalesce(p_actions, '')), '') is null then
    raise exception 'Las acciones tomadas o propuestas son obligatorias.';
  end if;
  if length(btrim(p_analysis)) > 10000
    or length(btrim(p_actions)) > 10000
    or length(coalesce(v_explanation, '')) > 10000 then
    raise exception 'El analisis, las acciones y la explicacion admiten como maximo 10000 caracteres.';
  end if;
  if not p_proceeds and v_explanation is null then
    raise exception 'Explica al cliente por que la queja no procede.';
  end if;

  select c.* into v_complaint
  from public.complaints c
  where c.id = p_complaint_id
  for update;

  if not found then
    raise exception 'La queja no existe.' using errcode = 'P0002';
  end if;
  if not public.can_manage_responsible_complaint(p_complaint_id) then
    raise exception 'Solo el area responsable puede finalizar esta gestion.'
      using errcode = '42501';
  end if;
  if v_complaint.status not in (
    'PENDING_MANAGEMENT', 'IN_MANAGEMENT',
    'RETURNED_BY_CLIENT', 'RETURNED_BY_CLOSURE'
  ) then
    raise exception 'La queja no admite una nueva respuesta desde su estado actual.';
  end if;

  select concat_ws(' ', p.first_name, nullif(p.middle_name, ''),
      p.paternal_surname, p.maternal_surname), p.area_id
  into v_actor_name, v_actor_area_id
  from public.profiles p
  where p.id = auth.uid() and p.status = 'active';

  select lower(btrim(cl.email)) into v_client_email
  from public.clients cl
  where cl.id = v_complaint.client_id;

  if v_client_email is null
    or v_client_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$'
    or length(v_client_email) > 254 then
    raise exception 'El cliente debe tener un correo valido antes de enviar la respuesta.';
  end if;

  update public.complaint_response_tokens
  set status = 'INVALIDATED'
  where complaint_id = p_complaint_id and status in ('QUEUED', 'SENT');

  v_version_number := v_complaint.current_action_version + 1;
  insert into public.complaint_action_versions (
    complaint_id, version_number, proceeds, analysis, actions,
    client_explanation, recorded_by, recorded_by_name
  ) values (
    p_complaint_id, v_version_number, p_proceeds, btrim(p_analysis),
    btrim(p_actions), v_explanation,
    auth.uid(), v_actor_name
  ) returning id into v_action_version_id;

  insert into public.complaint_response_tokens (
    complaint_id, action_version_id, token_hash, status
  ) values (
    p_complaint_id, v_action_version_id,
    encode(digest(v_response_token::text, 'sha256'), 'hex'), 'QUEUED'
  ) returning id into v_response_id;

  insert into public.email_outbox (
    id, event_type, aggregate_type, aggregate_id, recipient_email,
    cc_emails, template_key, template_data, idempotency_key
  ) values (
    v_outbox_id, 'COMPLAINT_RESPONSE_REQUESTED', 'COMPLAINT',
    p_complaint_id, v_client_email, '{}'::text[],
    'COMPLAINT_RESPONSE_REQUESTED',
    jsonb_build_object(
      'complaintId', p_complaint_id,
      'actionVersionId', v_action_version_id,
      'responseId', v_response_id,
      'responseToken', v_response_token,
      'complaintCode', v_complaint.complaint_code,
      'description', v_complaint.description,
      'proceeds', p_proceeds,
      'analysis', btrim(p_analysis),
      'actions', btrim(p_actions),
      'clientExplanation', v_explanation
    ),
    'complaint:' || p_complaint_id::text || ':response:' || v_version_number::text
  );

  insert into public.complaint_communications (
    complaint_id, action_version_id, communication_type,
    recipient_email, idempotency_key, outbox_id
  ) values (
    p_complaint_id, v_action_version_id, 'CLIENT_RESPONSE_REQUESTED',
    v_client_email,
    'complaint:' || p_complaint_id::text || ':response:' || v_version_number::text,
    v_outbox_id
  );

  update public.complaints
  set status = 'WAITING_CLIENT_RESPONSE',
      current_action_version = v_version_number
  where id = p_complaint_id;

  insert into public.complaint_events (
    complaint_id, event_type, previous_status, new_status,
    actor_id, actor_name, actor_area_id, notes, metadata
  ) values
  (
    p_complaint_id, 'ACTION_VERSION_RECORDED', v_complaint.status,
    'WAITING_CLIENT_RESPONSE', auth.uid(), v_actor_name, v_actor_area_id,
    'Se registro la version ' || v_version_number::text || ' de la gestion.',
    jsonb_build_object(
      'versionNumber', v_version_number,
      'actionVersionId', v_action_version_id,
      'proceeds', p_proceeds
    )
  ),
  (
    p_complaint_id, 'CLIENT_NOTIFICATION_QUEUED', v_complaint.status,
    'WAITING_CLIENT_RESPONSE', auth.uid(), v_actor_name, v_actor_area_id,
    'La respuesta al cliente quedo en cola de correo.',
    jsonb_build_object(
      'versionNumber', v_version_number,
      'responseId', v_response_id,
      'outboxId', v_outbox_id
    )
  );

  return jsonb_build_object(
    'status', 'WAITING_CLIENT_RESPONSE',
    'versionNumber', v_version_number,
    'actionVersionId', v_action_version_id,
    'notificationQueued', true
  );
end;
$$;

alter function public.submit_complaint_management(
  uuid, boolean, text, text, text
) owner to postgres;

create or replace function public.expire_complaint_response_token(
  p_response_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_response public.complaint_response_tokens%rowtype;
  v_changed boolean := false;
  v_complaint_code text;
  v_closure_area_id uuid;
  v_closure_area_name text;
  v_closure_email text;
  v_outbox_id uuid := gen_random_uuid();
begin
  select rt.* into v_response
  from public.complaint_response_tokens rt
  where rt.id = p_response_id
  for update;

  if not found or v_response.status <> 'SENT'
    or v_response.expires_at > now() then
    return false;
  end if;

  update public.complaint_response_tokens
  set status = 'EXPIRED'
  where id = v_response.id and status = 'SENT';

  update public.complaints
  set status = 'CLOSED_NO_RESPONSE', closed_at = now()
  where id = v_response.complaint_id
    and status = 'WAITING_CLIENT_RESPONSE';
  v_changed := found;

  if v_changed then
    insert into public.complaint_events (
      complaint_id, event_type, previous_status, new_status,
      actor_name, notes, metadata
    ) values (
      v_response.complaint_id, 'CLIENT_RESPONSE_EXPIRED',
      'WAITING_CLIENT_RESPONSE', 'CLOSED_NO_RESPONSE', 'Sistema',
      'El plazo de siete dias vencio sin respuesta del cliente.',
      jsonb_build_object('responseId', v_response.id)
    );

    select c.complaint_code, c.closure_area_id, a.name, lower(btrim(a.group_email))
    into v_complaint_code, v_closure_area_id, v_closure_area_name, v_closure_email
    from public.complaints c
    join public.areas a on a.id = c.closure_area_id and a.is_active
    where c.id = v_response.complaint_id;

    if v_closure_email is not null then
      insert into public.email_outbox (
        id, event_type, aggregate_type, aggregate_id, recipient_email,
        cc_emails, template_key, template_data, idempotency_key
      ) values (
        v_outbox_id, 'COMPLAINT_CLOSURE_PENDING', 'COMPLAINT',
        v_response.complaint_id, v_closure_email, '{}'::text[],
        'COMPLAINT_CLOSURE_PENDING',
        jsonb_build_object(
          'complaintId', v_response.complaint_id,
          'complaintCode', v_complaint_code,
          'closureAreaId', v_closure_area_id,
          'closureAreaName', v_closure_area_name,
          'reason', 'El cliente no respondio dentro del plazo de siete dias.'
        ),
        'complaint:' || v_response.complaint_id::text
          || ':response-expired:' || v_response.id::text
      );

      insert into public.complaint_communications (
        complaint_id, action_version_id, communication_type,
        recipient_email, idempotency_key, outbox_id
      ) values (
        v_response.complaint_id, v_response.action_version_id,
        'CLIENT_RESPONSE_EXPIRED', v_closure_email,
        'complaint:' || v_response.complaint_id::text
          || ':response-expired:' || v_response.id::text,
        v_outbox_id
      );
    end if;
  end if;
  return v_changed;
end;
$$;

alter function public.expire_complaint_response_token(uuid) owner to postgres;

create or replace function public.expire_pending_complaint_responses()
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_response record;
  v_count integer := 0;
begin
  for v_response in
    select rt.id
    from public.complaint_response_tokens rt
    join public.complaints c on c.id = rt.complaint_id
    where rt.status = 'SENT'
      and rt.expires_at <= now()
      and c.status = 'WAITING_CLIENT_RESPONSE'
    order by rt.expires_at
    for update of rt skip locked
  loop
    if public.expire_complaint_response_token(v_response.id) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

alter function public.expire_pending_complaint_responses() owner to postgres;

create or replace function public.get_public_complaint_response(
  p_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_response public.complaint_response_tokens%rowtype;
  v_complaint public.complaints%rowtype;
  v_version public.complaint_action_versions%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Operacion reservada al servicio publico de quejas.'
      using errcode = '42501';
  end if;

  select rt.* into v_response
  from public.complaint_response_tokens rt
  where rt.token_hash = encode(digest(p_token::text, 'sha256'), 'hex')
  for update;

  if not found then
    return jsonb_build_object('state', 'INVALID');
  end if;
  if v_response.status = 'SENT' and v_response.expires_at <= now() then
    perform public.expire_complaint_response_token(v_response.id);
    return jsonb_build_object('state', 'EXPIRED');
  end if;
  if v_response.status = 'QUEUED' then
    return jsonb_build_object('state', 'PENDING_DELIVERY');
  end if;
  if v_response.status = 'EXPIRED' then
    return jsonb_build_object('state', 'EXPIRED');
  end if;
  if v_response.status <> 'SENT' then
    return jsonb_build_object('state', 'CLOSED');
  end if;

  select c.* into v_complaint
  from public.complaints c where c.id = v_response.complaint_id;
  select av.* into v_version
  from public.complaint_action_versions av
  where av.id = v_response.action_version_id;

  return jsonb_build_object(
    'state', 'OPEN',
    'complaintCode', v_complaint.complaint_code,
    'description', v_complaint.description,
    'versionNumber', v_version.version_number,
    'proceeds', v_version.proceeds,
    'analysis', v_version.analysis,
    'actions', v_version.actions,
    'clientExplanation', v_version.client_explanation,
    'expiresAt', v_response.expires_at
  );
end;
$$;

alter function public.get_public_complaint_response(uuid) owner to postgres;

create or replace function public.respond_public_complaint(
  p_token uuid,
  p_agreed boolean,
  p_disagreement_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_response public.complaint_response_tokens%rowtype;
  v_complaint public.complaints%rowtype;
  v_reason text := nullif(btrim(coalesce(p_disagreement_reason, '')), '');
  v_new_status text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Operacion reservada al servicio publico de quejas.'
      using errcode = '42501';
  end if;
  if p_agreed is null
    or (not p_agreed and (v_reason is null or length(v_reason) > 5000)) then
    return jsonb_build_object('result', 'INVALID_RESPONSE');
  end if;

  select rt.* into v_response
  from public.complaint_response_tokens rt
  where rt.token_hash = encode(digest(p_token::text, 'sha256'), 'hex')
  for update;

  if not found then
    return jsonb_build_object('result', 'INVALID');
  end if;
  if v_response.status = 'SENT' and v_response.expires_at <= now() then
    perform public.expire_complaint_response_token(v_response.id);
    return jsonb_build_object('result', 'EXPIRED');
  end if;
  if v_response.status <> 'SENT' then
    return jsonb_build_object('result', 'CLOSED');
  end if;

  select c.* into v_complaint
  from public.complaints c
  where c.id = v_response.complaint_id
  for update;

  if v_complaint.status <> 'WAITING_CLIENT_RESPONSE'
    or v_complaint.current_action_version <> (
      select av.version_number
      from public.complaint_action_versions av
      where av.id = v_response.action_version_id
    ) then
    update public.complaint_response_tokens
    set status = 'INVALIDATED'
    where id = v_response.id and status = 'SENT';
    return jsonb_build_object('result', 'CLOSED');
  end if;

  v_new_status := case when p_agreed
    then 'PENDING_CLOSURE_REVIEW' else 'RETURNED_BY_CLIENT' end;

  update public.complaint_response_tokens
  set status = case when p_agreed then 'AGREED' else 'DISAGREED' end,
      responded_at = now(),
      disagreement_reason = case when p_agreed then null else v_reason end
  where id = v_response.id and status = 'SENT';

  update public.complaints
  set status = v_new_status
  where id = v_complaint.id and status = 'WAITING_CLIENT_RESPONSE';

  insert into public.complaint_events (
    complaint_id, event_type, previous_status, new_status,
    actor_name, notes, metadata
  ) values (
    v_complaint.id,
    case when p_agreed then 'CLIENT_AGREED' else 'CLIENT_DISAGREED' end,
    'WAITING_CLIENT_RESPONSE', v_new_status, 'Cliente',
    case when p_agreed
      then 'El cliente confirmo su conformidad con la gestion comunicada.'
      else v_reason end,
    jsonb_build_object(
      'responseId', v_response.id,
      'actionVersionId', v_response.action_version_id
    )
  );

  return jsonb_build_object(
    'result', case when p_agreed then 'AGREED' else 'DISAGREED' end
  );
end;
$$;

alter function public.respond_public_complaint(uuid, boolean, text)
  owner to postgres;

create or replace function public.sync_complaint_response_email_delivery()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_response_id uuid;
  v_complaint_id uuid;
begin
  if new.event_type <> 'COMPLAINT_RESPONSE_REQUESTED'
    or new.status is not distinct from old.status then
    return new;
  end if;

  select rt.id, rt.complaint_id
  into v_response_id, v_complaint_id
  from public.complaint_response_tokens rt
  join public.complaint_communications cc
    on cc.action_version_id = rt.action_version_id
   and cc.complaint_id = rt.complaint_id
  where cc.outbox_id = new.id
  limit 1;

  if v_response_id is null then
    return new;
  end if;

  if new.status = 'SENT' then
    update public.complaint_response_tokens
    set status = 'SENT', sent_at = new.accepted_at,
        expires_at = new.accepted_at + interval '7 days'
    where id = v_response_id and status = 'QUEUED';

    if found then
      insert into public.complaint_events (
        complaint_id, event_type, previous_status, new_status,
        actor_name, notes, metadata
      ) values (
        v_complaint_id, 'CLIENT_NOTIFICATION_SENT',
        'WAITING_CLIENT_RESPONSE', 'WAITING_CLIENT_RESPONSE', 'Sistema',
        'La respuesta fue entregada al servicio de correo.',
        jsonb_build_object(
          'responseId', v_response_id,
          'outboxId', new.id,
          'expiresAt', new.accepted_at + interval '7 days'
        )
      );
    end if;
  elsif new.status = 'FAILED_PERMANENT' then
    update public.complaint_response_tokens
    set status = 'DELIVERY_FAILED'
    where id = v_response_id and status = 'QUEUED';

    if found then
      update public.complaints
      set status = 'IN_MANAGEMENT'
      where id = v_complaint_id and status = 'WAITING_CLIENT_RESPONSE';

      insert into public.complaint_events (
        complaint_id, event_type, previous_status, new_status,
        actor_name, notes, metadata
      ) values (
        v_complaint_id, 'CLIENT_NOTIFICATION_FAILED',
        'WAITING_CLIENT_RESPONSE', 'IN_MANAGEMENT', 'Sistema',
        'El correo no pudo entregarse. El area responsable puede corregir y reenviar.',
        jsonb_build_object(
          'responseId', v_response_id,
          'outboxId', new.id,
          'errorCode', new.last_error_code
        )
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists email_outbox_sync_complaint_response
  on public.email_outbox;
create trigger email_outbox_sync_complaint_response
after update of status on public.email_outbox
for each row execute function public.sync_complaint_response_email_delivery();

revoke execute on function public.start_complaint_management(uuid)
  from public, anon;
revoke execute on function public.submit_complaint_management(
  uuid, boolean, text, text, text
) from public, anon;
revoke execute on function public.expire_complaint_response_token(uuid)
  from public, anon, authenticated;
revoke execute on function public.expire_pending_complaint_responses()
  from public, anon, authenticated;
revoke execute on function public.get_public_complaint_response(uuid)
  from public, anon, authenticated;
revoke execute on function public.respond_public_complaint(
  uuid, boolean, text
) from public, anon, authenticated;

grant execute on function public.start_complaint_management(uuid)
  to authenticated;
grant execute on function public.submit_complaint_management(
  uuid, boolean, text, text, text
) to authenticated;
grant execute on function public.expire_pending_complaint_responses()
  to service_role;
grant execute on function public.get_public_complaint_response(uuid)
  to service_role;
grant execute on function public.respond_public_complaint(
  uuid, boolean, text
) to service_role;

commit;
