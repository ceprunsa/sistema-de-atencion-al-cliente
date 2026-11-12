-- Etapa 5 del modulo de quejas: revision y seguimiento del area de cierre.
-- Ejecutar manualmente despues de 23_complaint_management_response.sql.
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
    'COMPLAINT_CLOSURE_PENDING', 'COMPLAINT_CLOSURE_RETURNED'
  )),
  add constraint email_outbox_aggregate_type_check check (aggregate_type in (
    'ATTENTION', 'REFERRAL', 'COMPLAINT'
  )),
  add constraint email_outbox_template_key_check check (template_key in (
    'REFERRAL_CREATED', 'ATTENTION_SURVEY', 'REFERRAL_RESOLVED',
    'COMPLAINT_CREATED', 'COMPLAINT_RESPONSE_REQUESTED',
    'COMPLAINT_CLOSURE_PENDING', 'COMPLAINT_CLOSURE_RETURNED'
  )),
  add constraint email_outbox_aggregate_event_check check (
    (event_type = 'ATTENTION_SURVEY' and aggregate_type = 'ATTENTION')
    or
    (event_type in ('REFERRAL_CREATED', 'REFERRAL_RESOLVED')
      and aggregate_type = 'REFERRAL')
    or
    (event_type in (
      'COMPLAINT_CREATED', 'COMPLAINT_RESPONSE_REQUESTED',
      'COMPLAINT_CLOSURE_PENDING', 'COMPLAINT_CLOSURE_RETURNED'
    ) and aggregate_type = 'COMPLAINT')
  );

create or replace function public.review_complaint_closure(
  p_complaint_id uuid,
  p_is_adequate boolean,
  p_observations text
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
  v_review_number integer;
  v_review_id uuid;
  v_new_status text;
  v_responsible_area_name text;
  v_responsible_email text;
  v_outbox_id uuid;
begin
  if p_is_adequate is null then
    raise exception 'Indica si la gestion y el cierre fueron adecuados.';
  end if;
  if nullif(btrim(coalesce(p_observations, '')), '') is null then
    raise exception 'Las observaciones del seguimiento son obligatorias.';
  end if;
  if length(btrim(p_observations)) > 10000 then
    raise exception 'Las observaciones admiten como maximo 10000 caracteres.';
  end if;

  select c.* into v_complaint
  from public.complaints c
  where c.id = p_complaint_id
  for update;

  if not found then
    raise exception 'La queja no existe.' using errcode = 'P0002';
  end if;
  if not public.can_manage_closure_complaint(p_complaint_id) then
    raise exception 'Solo el area de cierre puede registrar este seguimiento.'
      using errcode = '42501';
  end if;
  if v_complaint.status not in (
    'PENDING_CLOSURE_REVIEW', 'CLOSED_NO_RESPONSE'
  ) then
    raise exception 'La queja no admite una revision de cierre desde su estado actual.';
  end if;

  select concat_ws(' ', p.first_name, nullif(p.middle_name, ''),
      p.paternal_surname, p.maternal_surname), p.area_id
  into v_actor_name, v_actor_area_id
  from public.profiles p
  where p.id = auth.uid() and p.status = 'active';

  select coalesce(max(cr.review_number), 0) + 1
  into v_review_number
  from public.complaint_closure_reviews cr
  where cr.complaint_id = p_complaint_id;

  insert into public.complaint_closure_reviews (
    complaint_id, review_number, is_adequate, observations,
    reviewed_by, reviewed_by_name
  ) values (
    p_complaint_id, v_review_number, p_is_adequate,
    btrim(p_observations), auth.uid(), v_actor_name
  ) returning id into v_review_id;

  if v_complaint.status = 'CLOSED_NO_RESPONSE' then
    insert into public.complaint_events (
      complaint_id, event_type, previous_status, new_status,
      actor_id, actor_name, actor_area_id, notes, metadata
    ) values (
      p_complaint_id, 'CLOSURE_REVIEWED', 'CLOSED_NO_RESPONSE',
      'CLOSED_NO_RESPONSE', auth.uid(), v_actor_name, v_actor_area_id,
      btrim(p_observations),
      jsonb_build_object(
        'reviewId', v_review_id,
        'reviewNumber', v_review_number,
        'isAdequate', p_is_adequate,
        'automaticClosureFollowUp', true
      )
    );

    return jsonb_build_object(
      'status', 'CLOSED_NO_RESPONSE',
      'reviewNumber', v_review_number,
      'followUpOnly', true
    );
  end if;

  v_new_status := case when p_is_adequate
    then 'PENDING_SAC_EVALUATION' else 'RETURNED_BY_CLOSURE' end;

  update public.complaints
  set status = v_new_status
  where id = p_complaint_id and status = 'PENDING_CLOSURE_REVIEW';

  insert into public.complaint_events (
    complaint_id, event_type, previous_status, new_status,
    actor_id, actor_name, actor_area_id, notes, metadata
  ) values (
    p_complaint_id, 'CLOSURE_REVIEWED', 'PENDING_CLOSURE_REVIEW',
    v_new_status, auth.uid(), v_actor_name, v_actor_area_id,
    btrim(p_observations),
    jsonb_build_object(
      'reviewId', v_review_id,
      'reviewNumber', v_review_number,
      'isAdequate', p_is_adequate
    )
  );

  if not p_is_adequate then
    select a.name, lower(btrim(a.group_email))
    into v_responsible_area_name, v_responsible_email
    from public.areas a
    where a.id = v_complaint.responsible_area_id and a.is_active;

    if v_responsible_email is null then
      raise exception 'El area responsable no tiene un correo grupal valido.';
    end if;

    v_outbox_id := gen_random_uuid();
    insert into public.email_outbox (
      id, event_type, aggregate_type, aggregate_id, recipient_email,
      cc_emails, template_key, template_data, idempotency_key
    ) values (
      v_outbox_id, 'COMPLAINT_CLOSURE_RETURNED', 'COMPLAINT',
      p_complaint_id, v_responsible_email, '{}'::text[],
      'COMPLAINT_CLOSURE_RETURNED',
      jsonb_build_object(
        'complaintId', p_complaint_id,
        'complaintCode', v_complaint.complaint_code,
        'responsibleAreaId', v_complaint.responsible_area_id,
        'responsibleAreaName', v_responsible_area_name,
        'reviewId', v_review_id,
        'observations', btrim(p_observations)
      ),
      'complaint:' || p_complaint_id::text
        || ':closure-returned:' || v_review_id::text
    );

    insert into public.complaint_communications (
      complaint_id, action_version_id, communication_type,
      recipient_email, idempotency_key, outbox_id
    ) values (
      p_complaint_id,
      (
        select av.id from public.complaint_action_versions av
        where av.complaint_id = p_complaint_id
          and av.version_number = v_complaint.current_action_version
      ),
      'CLOSURE_RETURNED', v_responsible_email,
      'complaint:' || p_complaint_id::text
        || ':closure-returned:' || v_review_id::text,
      v_outbox_id
    );

    insert into public.complaint_events (
      complaint_id, event_type, previous_status, new_status,
      actor_id, actor_name, actor_area_id, notes, metadata
    ) values (
      p_complaint_id, 'CLOSURE_RETURNED', 'PENDING_CLOSURE_REVIEW',
      'RETURNED_BY_CLOSURE', auth.uid(), v_actor_name, v_actor_area_id,
      btrim(p_observations),
      jsonb_build_object(
        'reviewId', v_review_id,
        'outboxId', v_outbox_id
      )
    );
  end if;

  return jsonb_build_object(
    'status', v_new_status,
    'reviewNumber', v_review_number,
    'followUpOnly', false,
    'notificationQueued', not p_is_adequate
  );
end;
$$;

alter function public.review_complaint_closure(uuid, boolean, text)
  owner to postgres;

create or replace function public.get_pending_complaint_count()
returns bigint
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_area_id uuid;
begin
  if v_user_id is null or public.is_active_tablet_session() then
    return 0;
  end if;

  select p.area_id into v_area_id
  from public.profiles p
  where p.id = v_user_id and p.status = 'active';

  if v_area_id is null then
    return 0;
  end if;

  return (
    select count(*)
    from public.complaints c
    where (
      c.responsible_area_id = v_area_id
      and c.status in (
        'PENDING_MANAGEMENT', 'IN_MANAGEMENT',
        'RETURNED_BY_CLIENT', 'RETURNED_BY_CLOSURE'
      )
    ) or (
      c.closure_area_id = v_area_id
      and (
        c.status in ('PENDING_CLOSURE_REVIEW', 'PENDING_SAC_EVALUATION')
        or (
          c.status = 'CLOSED_NO_RESPONSE'
          and not exists (
            select 1 from public.complaint_closure_reviews cr
            where cr.complaint_id = c.id
          )
        )
      )
    )
  );
end;
$$;

alter function public.get_pending_complaint_count() owner to postgres;

revoke execute on function public.review_complaint_closure(
  uuid, boolean, text
) from public, anon;
grant execute on function public.review_complaint_closure(
  uuid, boolean, text
) to authenticated;

commit;
