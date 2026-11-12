-- Etapa 3 del modulo de quejas: listado, buzones y detalle protegido.
-- Ejecutar manualmente despues de 21_complaint_creation.sql.
begin;

create or replace function public.list_complaints(
  p_page integer default 1,
  p_limit integer default 10,
  p_search text default '',
  p_status text default null,
  p_area_id uuid default null,
  p_scope text default 'ALL'
)
returns table (
  id uuid,
  complaint_code text,
  complaint_status text,
  description_preview text,
  client_id uuid,
  client_dni text,
  client_name text,
  client_email text,
  attention_id uuid,
  rac_code text,
  service_channel_name text,
  responsible_area_id uuid,
  responsible_area_name text,
  closure_area_id uuid,
  closure_area_name text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz,
  is_creator boolean,
  can_manage_responsible boolean,
  can_manage_closure boolean,
  total_count bigint
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_area_id uuid;
  v_is_admin boolean;
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 100));
  v_search text := nullif(btrim(p_search), '');
  v_status text := nullif(btrim(p_status), '');
  v_scope text := upper(coalesce(nullif(btrim(p_scope), ''), 'ALL'));
begin
  if v_user_id is null or public.is_active_tablet_session() then
    raise exception 'No tienes permiso para consultar quejas.'
      using errcode = '42501';
  end if;

  select p.area_id into v_user_area_id
  from public.profiles p
  where p.id = v_user_id and p.status = 'active';
  if not found then
    raise exception 'Tu usuario no esta activo.' using errcode = '42501';
  end if;

  v_is_admin := public.is_admin();
  if v_scope not in ('ALL', 'CREATED_BY_ME', 'RESPONSIBLE_AREA', 'CLOSURE_AREA') then
    raise exception 'El alcance de consulta no es valido.';
  end if;

  return query
  select
    c.id,
    c.complaint_code,
    c.status,
    case
      when length(c.description) > 200
        then left(c.description, 200) || '...'
      else c.description
    end,
    cl.id,
    cl.dni,
    cl.display_name,
    cl.email,
    ca.id,
    ca.rac_code,
    sc.name,
    responsible.id,
    responsible.name,
    closing.id,
    closing.name,
    c.created_by,
    c.created_by_name,
    c.created_at,
    c.created_by = v_user_id,
    c.responsible_area_id = v_user_area_id and responsible.is_active,
    c.closure_area_id = v_user_area_id
      and closing.is_active
      and c.status in (
        'PENDING_CLOSURE_REVIEW', 'PENDING_SAC_EVALUATION',
        'CLOSED_AGREED', 'CLOSED_NO_RESPONSE'
      ),
    count(*) over()
  from public.complaints c
  join public.clients cl on cl.id = c.client_id
  join public.service_channels sc on sc.id = c.service_channel_id
  join public.areas responsible on responsible.id = c.responsible_area_id
  join public.areas closing on closing.id = c.closure_area_id
  left join public.customer_attentions ca on ca.id = c.attention_id
  where (
      v_is_admin
      or c.created_by = v_user_id
      or c.responsible_area_id = v_user_area_id
      or (
        c.closure_area_id = v_user_area_id
        and c.status in (
          'PENDING_CLOSURE_REVIEW', 'PENDING_SAC_EVALUATION',
          'CLOSED_AGREED', 'CLOSED_NO_RESPONSE'
        )
      )
    )
    and (
      v_scope = 'ALL'
      or (v_scope = 'CREATED_BY_ME' and c.created_by = v_user_id)
      or (v_scope = 'RESPONSIBLE_AREA'
        and c.responsible_area_id = v_user_area_id)
      or (v_scope = 'CLOSURE_AREA'
        and c.closure_area_id = v_user_area_id
        and c.status in (
          'PENDING_CLOSURE_REVIEW', 'PENDING_SAC_EVALUATION',
          'CLOSED_AGREED', 'CLOSED_NO_RESPONSE'
        ))
    )
    and (v_status is null or c.status = v_status)
    and (p_area_id is null or c.responsible_area_id = p_area_id)
    and (
      v_search is null
      or c.complaint_code ilike '%' || v_search || '%'
      or (
        regexp_replace(v_search, '[^0-9]', '', 'g') <> ''
        and cl.dni ilike '%' || regexp_replace(v_search, '[^0-9]', '', 'g') || '%'
      )
      or cl.display_name ilike '%' || v_search || '%'
      or ca.rac_code ilike '%' || v_search || '%'
    )
  order by c.created_at desc, c.id desc
  limit v_limit
  offset (v_page - 1) * v_limit;
end;
$$;

alter function public.list_complaints(
  integer, integer, text, text, uuid, text
) owner to postgres;

create or replace function public.get_pending_complaint_count()
returns bigint
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_area_id uuid;
begin
  if auth.uid() is null or public.is_active_tablet_session() then
    return 0;
  end if;

  select p.area_id into v_area_id
  from public.profiles p
  join public.areas a on a.id = p.area_id and a.is_active
  where p.id = auth.uid() and p.status = 'active';

  if v_area_id is null then
    return 0;
  end if;

  return (
    select count(*)
    from public.complaints c
    where c.responsible_area_id = v_area_id
      and c.status in (
        'PENDING_MANAGEMENT', 'IN_MANAGEMENT',
        'RETURNED_BY_CLIENT', 'RETURNED_BY_CLOSURE'
      )
  );
end;
$$;

alter function public.get_pending_complaint_count() owner to postgres;

create or replace function public.get_complaint_detail(p_complaint_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if p_complaint_id is null
    or not public.can_view_complaint(p_complaint_id) then
    raise exception 'No tienes permiso para consultar esta queja.'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', c.id,
    'complaintCode', c.complaint_code,
    'status', c.status,
    'description', c.description,
    'createdById', c.created_by,
    'createdByName', c.created_by_name,
    'createdByEmail', c.created_by_email,
    'createdAt', c.created_at,
    'updatedAt', c.updated_at,
    'closedAt', c.closed_at,
    'currentActionVersion', c.current_action_version,
    'client', jsonb_build_object(
      'id', cl.id,
      'dni', cl.dni,
      'displayName', cl.display_name,
      'firstName', cl.first_name,
      'middleName', cl.middle_name,
      'paternalSurname', cl.paternal_surname,
      'maternalSurname', cl.maternal_surname,
      'email', cl.email,
      'phone', cl.phone
    ),
    'linkedAttention', case when ca.id is null then null else jsonb_build_object(
      'id', ca.id,
      'racCode', ca.rac_code,
      'status', ca.status,
      'createdAt', ca.created_at
    ) end,
    'serviceChannel', jsonb_build_object(
      'id', sc.id,
      'name', sc.name,
      'detail', sc.detail,
      'category', sc.category
    ),
    'responsibleArea', jsonb_build_object(
      'id', responsible.id,
      'name', responsible.name,
      'groupEmail', responsible.group_email,
      'isActive', responsible.is_active
    ),
    'closureArea', jsonb_build_object(
      'id', closing.id,
      'name', closing.name,
      'groupEmail', closing.group_email,
      'isActive', closing.is_active
    ),
    'permissions', jsonb_build_object(
      'isAdmin', public.is_admin(),
      'isCreator', c.created_by = auth.uid(),
      'canManageResponsible', public.can_manage_responsible_complaint(c.id),
      'canManageClosure', public.can_manage_closure_complaint(c.id)
    ),
    'actionVersions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', av.id,
        'versionNumber', av.version_number,
        'proceeds', av.proceeds,
        'analysis', av.analysis,
        'actions', av.actions,
        'clientExplanation', av.client_explanation,
        'recordedByName', av.recorded_by_name,
        'recordedAt', av.recorded_at
      ) order by av.version_number)
      from public.complaint_action_versions av
      where av.complaint_id = c.id
    ), '[]'::jsonb),
    'clientResponses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rt.id,
        'actionVersionId', rt.action_version_id,
        'versionNumber', av.version_number,
        'status', rt.status,
        'sentAt', rt.sent_at,
        'expiresAt', rt.expires_at,
        'respondedAt', rt.responded_at,
        'disagreementReason', rt.disagreement_reason
      ) order by av.version_number)
      from public.complaint_response_tokens rt
      join public.complaint_action_versions av
        on av.id = rt.action_version_id
      where rt.complaint_id = c.id
    ), '[]'::jsonb),
    'closureReviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cr.id,
        'reviewNumber', cr.review_number,
        'isAdequate', cr.is_adequate,
        'observations', cr.observations,
        'reviewedByName', cr.reviewed_by_name,
        'reviewedAt', cr.reviewed_at
      ) order by cr.review_number)
      from public.complaint_closure_reviews cr
      where cr.complaint_id = c.id
    ), '[]'::jsonb),
    'sacDecision', (
      select jsonb_build_object(
        'id', sd.id,
        'shouldCreateSac', sd.should_create_sac,
        'comments', sd.comments,
        'decidedByName', sd.decided_by_name,
        'decidedAt', sd.decided_at
      )
      from public.complaint_sac_decisions sd
      where sd.complaint_id = c.id
    ),
    'sac', (
      select jsonb_build_object(
        'id', sac.id,
        'sacCode', sac.sac_code,
        'createdByName', sac.created_by_name,
        'createdAt', sac.created_at
      )
      from public.corrective_action_requests sac
      where sac.complaint_id = c.id
    ),
    'communications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cc.id,
        'type', cc.communication_type,
        'recipientEmail', cc.recipient_email,
        'createdAt', cc.created_at,
        'deliveryStatus', eo.status,
        'acceptedAt', eo.accepted_at,
        'attemptCount', eo.attempt_count,
        'lastErrorCode', eo.last_error_code,
        'lastErrorMessage', eo.last_error_message
      ) order by cc.created_at, cc.id)
      from public.complaint_communications cc
      left join public.email_outbox eo on eo.id = cc.outbox_id
      where cc.complaint_id = c.id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ce.id,
        'type', ce.event_type,
        'previousStatus', ce.previous_status,
        'newStatus', ce.new_status,
        'actorName', ce.actor_name,
        'notes', ce.notes,
        'metadata', ce.metadata,
        'occurredAt', ce.occurred_at
      ) order by ce.occurred_at, ce.id)
      from public.complaint_events ce
      where ce.complaint_id = c.id
    ), '[]'::jsonb)
  )
  into v_result
  from public.complaints c
  join public.clients cl on cl.id = c.client_id
  join public.service_channels sc on sc.id = c.service_channel_id
  join public.areas responsible on responsible.id = c.responsible_area_id
  join public.areas closing on closing.id = c.closure_area_id
  left join public.customer_attentions ca on ca.id = c.attention_id
  where c.id = p_complaint_id;

  if v_result is null then
    raise exception 'La queja no existe.' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

alter function public.get_complaint_detail(uuid) owner to postgres;

revoke execute on function public.list_complaints(
  integer, integer, text, text, uuid, text
) from public, anon;
revoke execute on function public.get_pending_complaint_count()
  from public, anon;
revoke execute on function public.get_complaint_detail(uuid)
  from public, anon;

grant execute on function public.list_complaints(
  integer, integer, text, text, uuid, text
) to authenticated;
grant execute on function public.get_pending_complaint_count()
  to authenticated;
grant execute on function public.get_complaint_detail(uuid)
  to authenticated;

commit;

