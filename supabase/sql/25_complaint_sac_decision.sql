-- Etapa 6 del modulo de quejas: decision y generacion de SAC.
-- Ejecutar manualmente despues de 24_complaint_closure_review.sql.
begin;

create or replace function public.decide_complaint_sac(
  p_complaint_id uuid,
  p_should_create_sac boolean,
  p_comments text
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
  v_decision_id uuid;
  v_sac_year integer;
  v_sac_number bigint;
  v_sac_code text;
  v_sac_id uuid;
  v_follow_up_only boolean;
begin
  if p_should_create_sac is null then
    raise exception 'Indica si corresponde generar una SAC.';
  end if;
  if nullif(btrim(coalesce(p_comments, '')), '') is null then
    raise exception 'Los comentarios de la decision SAC son obligatorios.';
  end if;
  if length(btrim(p_comments)) > 10000 then
    raise exception 'Los comentarios admiten como maximo 10000 caracteres.';
  end if;

  select c.* into v_complaint
  from public.complaints c
  where c.id = p_complaint_id
  for update;

  if not found then
    raise exception 'La queja no existe.' using errcode = 'P0002';
  end if;
  if not public.can_manage_closure_complaint(p_complaint_id) then
    raise exception 'Solo el area de cierre puede registrar la decision SAC.'
      using errcode = '42501';
  end if;
  if v_complaint.status not in (
    'PENDING_SAC_EVALUATION', 'CLOSED_NO_RESPONSE'
  ) then
    raise exception 'La queja no admite una decision SAC desde su estado actual.';
  end if;
  if exists (
    select 1 from public.complaint_sac_decisions sd
    where sd.complaint_id = p_complaint_id
  ) then
    raise exception 'La decision SAC de esta queja ya fue registrada.';
  end if;
  if v_complaint.status = 'CLOSED_NO_RESPONSE' and not exists (
    select 1 from public.complaint_closure_reviews cr
    where cr.complaint_id = p_complaint_id
  ) then
    raise exception 'Registra primero el seguimiento del cierre por falta de respuesta.';
  end if;

  select concat_ws(' ', p.first_name, nullif(p.middle_name, ''),
      p.paternal_surname, p.maternal_surname), p.area_id
  into v_actor_name, v_actor_area_id
  from public.profiles p
  where p.id = auth.uid() and p.status = 'active';

  insert into public.complaint_sac_decisions (
    complaint_id, should_create_sac, comments,
    decided_by, decided_by_name
  ) values (
    p_complaint_id, p_should_create_sac, btrim(p_comments),
    auth.uid(), v_actor_name
  ) returning id into v_decision_id;

  if p_should_create_sac then
    select code.sac_year, code.sac_number, code.sac_code
    into v_sac_year, v_sac_number, v_sac_code
    from public.reserve_sac_code() code;

    insert into public.corrective_action_requests (
      complaint_id, sac_year, sac_number, sac_code,
      created_by, created_by_name
    ) values (
      p_complaint_id, v_sac_year, v_sac_number, v_sac_code,
      auth.uid(), v_actor_name
    ) returning id into v_sac_id;
  end if;

  v_follow_up_only := v_complaint.status = 'CLOSED_NO_RESPONSE';
  if not v_follow_up_only then
    update public.complaints
    set status = 'CLOSED_AGREED', closed_at = now()
    where id = p_complaint_id and status = 'PENDING_SAC_EVALUATION';
  end if;

  insert into public.complaint_events (
    complaint_id, event_type, previous_status, new_status,
    actor_id, actor_name, actor_area_id, notes, metadata
  ) values (
    p_complaint_id, 'SAC_DECIDED', v_complaint.status,
    case when v_follow_up_only then 'CLOSED_NO_RESPONSE' else 'CLOSED_AGREED' end,
    auth.uid(), v_actor_name, v_actor_area_id, btrim(p_comments),
    jsonb_build_object(
      'decisionId', v_decision_id,
      'shouldCreateSac', p_should_create_sac,
      'followUpOnly', v_follow_up_only
    )
  );

  if p_should_create_sac then
    insert into public.complaint_events (
      complaint_id, event_type, previous_status, new_status,
      actor_id, actor_name, actor_area_id, notes, metadata
    ) values (
      p_complaint_id, 'SAC_CREATED', v_complaint.status,
      case when v_follow_up_only then 'CLOSED_NO_RESPONSE' else 'CLOSED_AGREED' end,
      auth.uid(), v_actor_name, v_actor_area_id,
      'Se genero la ' || v_sac_code || ' vinculada a la queja.',
      jsonb_build_object(
        'sacId', v_sac_id,
        'sacCode', v_sac_code,
        'decisionId', v_decision_id
      )
    );
  end if;

  if not v_follow_up_only then
    insert into public.complaint_events (
      complaint_id, event_type, previous_status, new_status,
      actor_id, actor_name, actor_area_id, notes, metadata
    ) values (
      p_complaint_id, 'STATUS_CHANGED', 'PENDING_SAC_EVALUATION',
      'CLOSED_AGREED', auth.uid(), v_actor_name, v_actor_area_id,
      'La queja fue cerrada despues de completar la evaluacion SAC.',
      jsonb_build_object('decisionId', v_decision_id)
    );
  end if;

  return jsonb_build_object(
    'status', case when v_follow_up_only
      then 'CLOSED_NO_RESPONSE' else 'CLOSED_AGREED' end,
    'shouldCreateSac', p_should_create_sac,
    'sacId', v_sac_id,
    'sacCode', v_sac_code,
    'followUpOnly', v_follow_up_only
  );
end;
$$;

alter function public.decide_complaint_sac(uuid, boolean, text)
  owner to postgres;

revoke execute on function public.decide_complaint_sac(
  uuid, boolean, text
) from public, anon;
grant execute on function public.decide_complaint_sac(
  uuid, boolean, text
) to authenticated;

commit;
