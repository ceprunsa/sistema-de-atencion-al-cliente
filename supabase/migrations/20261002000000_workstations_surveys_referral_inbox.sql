-- Mesas de trabajo, tablet, encuestas y buzón de derivaciones.
-- Ejecutar después de 01_setup.sql y 03_customer_service.sql.

begin;

create table public.workstations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (btrim(name) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workstation_assignments (
  id uuid primary key default gen_random_uuid(),
  workstation_id uuid not null references public.workstations(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_by_name text not null check (btrim(assigned_by_name) <> ''),
  assigned_at timestamptz not null default now(),
  ended_by uuid references public.profiles(id) on delete set null,
  ended_by_name text,
  ended_at timestamptz,
  check ((ended_at is null and ended_by_name is null)
    or (ended_at is not null and nullif(btrim(ended_by_name), '') is not null))
);

create unique index workstation_assignments_active_workstation_uidx
  on public.workstation_assignments (workstation_id) where ended_at is null;
create unique index workstation_assignments_active_user_uidx
  on public.workstation_assignments (user_id) where ended_at is null;

create table public.tablet_bindings (
  id uuid primary key default gen_random_uuid(),
  workstation_id uuid not null references public.workstations(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null,
  activated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles(id) on delete set null,
  deactivated_by_name text,
  deactivation_reason text,
  check ((deactivated_at is null and deactivated_by_name is null and deactivation_reason is null)
    or (deactivated_at is not null and nullif(btrim(deactivated_by_name), '') is not null
      and nullif(btrim(deactivation_reason), '') is not null))
);

create unique index tablet_bindings_active_workstation_uidx
  on public.tablet_bindings (workstation_id) where deactivated_at is null;
create unique index tablet_bindings_active_user_uidx
  on public.tablet_bindings (user_id) where deactivated_at is null;
create unique index tablet_bindings_active_session_uidx
  on public.tablet_bindings (session_id) where deactivated_at is null;

create table public.attention_surveys (
  id uuid primary key default gen_random_uuid(),
  attention_id uuid not null unique references public.customer_attentions(id) on delete cascade,
  workstation_id uuid not null references public.workstations(id) on delete restrict,
  purpose text not null default 'ATTENTION' check (purpose in ('ATTENTION')),
  channel text not null default 'TABLET' check (channel in ('TABLET')),
  status text not null default 'PENDING_DECISION'
    check (status in ('PENDING_DECISION', 'SENT', 'COMPLETED', 'SKIPPED', 'CANCELLED')),
  response text check (response in ('VERY_SATISFIED', 'SATISFIED', 'DISSATISFIED', 'VERY_DISSATISFIED')),
  requested_by uuid references public.profiles(id) on delete set null,
  requested_by_name text not null check (btrim(requested_by_name) <> ''),
  sent_binding_id uuid references public.tablet_bindings(id) on delete set null,
  sent_at timestamptz,
  completed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  closed_by_name text,
  closed_at timestamptz,
  closed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'PENDING_DECISION' and response is null and sent_at is null and completed_at is null and closed_at is null)
    or (status = 'SENT' and response is null and sent_at is not null and completed_at is null and closed_at is null)
    or (status = 'COMPLETED' and response is not null and sent_at is not null and completed_at is not null and closed_at is null)
    or (status in ('SKIPPED', 'CANCELLED') and response is null and completed_at is null
      and closed_at is not null and nullif(btrim(closed_reason), '') is not null)
  )
);

create unique index attention_surveys_open_workstation_uidx
  on public.attention_surveys (workstation_id)
  where status in ('PENDING_DECISION', 'SENT');
create index attention_surveys_status_idx on public.attention_surveys (status);
create index attention_surveys_requested_by_idx on public.attention_surveys (requested_by);

alter table public.attention_referrals
  add column source_area_id uuid references public.areas(id) on delete set null,
  add column source_area_name text,
  add column status text,
  add column disabled_reason text,
  add column disabled_by uuid references public.profiles(id) on delete set null,
  add column disabled_by_name text,
  add column disabled_at timestamptz,
  add column cancelled_reason text,
  add column cancelled_by uuid references public.profiles(id) on delete set null,
  add column cancelled_by_name text,
  add column cancelled_at timestamptz;

update public.attention_referrals
set status = case when conclusion is null then 'PENDING' else 'RESOLVED' end
where status is null;

alter table public.attention_referrals
  alter column status set default 'PENDING',
  alter column status set not null,
  add constraint attention_referrals_status_check
    check (status in ('PENDING', 'RESOLVED', 'DISABLED', 'CANCELLED')),
  add constraint attention_referrals_source_area_name_check
    check (source_area_name is null or btrim(source_area_name) <> ''),
  add constraint attention_referrals_state_fields_check check (
    (status = 'PENDING' and conclusion is null and concluded_at is null and disabled_at is null and cancelled_at is null)
    or (status = 'RESOLVED' and nullif(btrim(conclusion), '') is not null and concluded_at is not null
      and nullif(btrim(concluded_by_name), '') is not null and disabled_at is null and cancelled_at is null)
    or (status = 'DISABLED' and conclusion is null and concluded_at is null and disabled_at is not null
      and nullif(btrim(disabled_reason), '') is not null and nullif(btrim(disabled_by_name), '') is not null
      and cancelled_at is null)
    or (status = 'CANCELLED' and conclusion is null and concluded_at is null and cancelled_at is not null
      and nullif(btrim(cancelled_reason), '') is not null and nullif(btrim(cancelled_by_name), '') is not null
      and disabled_at is null)
  );

create index attention_referrals_status_area_idx
  on public.attention_referrals (status, destination_area_id, referred_at desc);

create trigger workstations_set_updated_at before update on public.workstations
for each row execute function public.set_updated_at();
create trigger attention_surveys_set_updated_at before update on public.attention_surveys
for each row execute function public.set_updated_at();

create or replace function public.guard_workstation_deactivation()
returns trigger language plpgsql set search_path = public
as $$
begin
  if old.is_active and not new.is_active and (
    exists (select 1 from public.workstation_assignments wa where wa.workstation_id = old.id and wa.ended_at is null)
    or exists (select 1 from public.tablet_bindings tb where tb.workstation_id = old.id and tb.deactivated_at is null)
    or exists (select 1 from public.attention_surveys s where s.workstation_id = old.id and s.status in ('PENDING_DECISION', 'SENT'))
  ) then
    raise exception 'Libera la asignación, la tablet y la encuesta pendiente antes de inhabilitar la mesa.';
  end if;
  return new;
end;
$$;

create trigger workstations_guard_deactivation
before update of is_active on public.workstations
for each row execute function public.guard_workstation_deactivation();

create or replace function public.current_session_id()
returns uuid language sql stable set search_path = public
as $$ select nullif(auth.jwt() ->> 'session_id', '')::uuid $$;

create or replace function public.is_active_tablet_session()
returns boolean language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.tablet_bindings tb
    where tb.user_id = auth.uid()
      and tb.session_id = public.current_session_id()
      and tb.deactivated_at is null
  )
$$;

create or replace function public.active_workstation_for_user(p_user_id uuid)
returns uuid language sql security definer stable set search_path = public
as $$
  select wa.workstation_id
  from public.workstation_assignments wa
  join public.workstations w on w.id = wa.workstation_id and w.is_active
  where wa.user_id = p_user_id and wa.ended_at is null
  limit 1
$$;

create or replace function public.require_attention_workstation()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_workstation_id uuid;
begin
  if public.is_active_tablet_session() then
    raise exception 'Una sesión de tablet no puede registrar atenciones.';
  end if;

  select public.active_workstation_for_user(new.created_by) into v_workstation_id;
  if v_workstation_id is null then
    raise exception 'Debes tener una mesa de trabajo activa para registrar atenciones.';
  end if;

  perform 1 from public.workstations w where w.id = v_workstation_id for update;
  if exists (
    select 1 from public.attention_surveys s
    where s.workstation_id = v_workstation_id
      and s.status in ('PENDING_DECISION', 'SENT')
  ) then
    raise exception 'Debes completar u omitir la encuesta pendiente antes de registrar otra atención.';
  end if;
  return new;
end;
$$;

create trigger customer_attentions_require_workstation
before insert on public.customer_attentions
for each row execute function public.require_attention_workstation();

create or replace function public.create_attention_survey()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_workstation_id uuid;
begin
  select public.active_workstation_for_user(new.created_by) into v_workstation_id;
  insert into public.attention_surveys (
    attention_id, workstation_id, requested_by, requested_by_name
  ) values (
    new.id, v_workstation_id, new.created_by, new.created_by_name
  );
  return new;
end;
$$;

create trigger customer_attentions_create_survey
after insert on public.customer_attentions
for each row execute function public.create_attention_survey();

create or replace function public.prepare_attention_referral()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_area_id uuid;
  v_area_name text;
begin
  if tg_op = 'UPDATE' and old.status <> 'PENDING' then
    raise exception 'Una derivación cerrada no puede modificarse.';
  end if;

  if tg_op = 'UPDATE' and new.status not in ('PENDING', 'RESOLVED', 'DISABLED', 'CANCELLED') then
    raise exception 'Transición de derivación inválida.';
  end if;

  if tg_op = 'INSERT'
    or new.referred_by is distinct from old.referred_by
    or new.destination_area_id is distinct from old.destination_area_id then
    select p.area_id, a.name into v_area_id, v_area_name
    from public.profiles p left join public.areas a on a.id = p.area_id
    where p.id = new.referred_by;

    new.source_area_id := v_area_id;
    new.source_area_name := v_area_name;
    if v_area_id is not null and new.destination_area_id = v_area_id then
      raise exception 'No puedes derivar una atención a tu misma área.';
    end if;
  end if;
  return new;
end;
$$;

create trigger attention_referrals_prepare
before insert or update on public.attention_referrals
for each row execute function public.prepare_attention_referral();

create or replace function public.prevent_closed_referral_delete()
returns trigger language plpgsql set search_path = public
as $$
begin
  if old.status <> 'PENDING' then
    raise exception 'Una derivación cerrada no puede eliminarse.';
  end if;
  return old;
end;
$$;

create trigger attention_referrals_prevent_closed_delete
before delete on public.attention_referrals
for each row execute function public.prevent_closed_referral_delete();

create or replace function public.close_attention_children()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if old.status = 'ACTIVE' and new.status = 'DISABLED' then
    update public.attention_surveys
    set status = 'CANCELLED', closed_by = new.disabled_by,
        closed_by_name = coalesce(new.disabled_by_name, 'Sistema'), closed_at = now(),
        closed_reason = 'Atención inhabilitada: ' || coalesce(new.disabled_reason, 'Sin motivo')
    where attention_id = new.id and status in ('PENDING_DECISION', 'SENT');

    update public.attention_referrals
    set status = 'CANCELLED', cancelled_by = new.disabled_by,
        cancelled_by_name = coalesce(new.disabled_by_name, 'Sistema'), cancelled_at = now(),
        cancelled_reason = 'Atención inhabilitada: ' || coalesce(new.disabled_reason, 'Sin motivo')
    where attention_id = new.id and status = 'PENDING';
  end if;
  return new;
end;
$$;

create trigger customer_attentions_close_children
after update of status on public.customer_attentions
for each row execute function public.close_attention_children();

create or replace function public.close_deleted_user_surveys()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_name text := concat_ws(' ', old.first_name, nullif(old.middle_name, ''), old.paternal_surname, old.maternal_surname);
begin
  update public.attention_surveys set status = 'CANCELLED', closed_by = old.id,
    closed_by_name = v_name, closed_at = now(), closed_reason = 'Usuario responsable eliminado'
  where requested_by = old.id and status in ('PENDING_DECISION', 'SENT');
  return old;
end;
$$;

create trigger profiles_close_open_surveys
before delete on public.profiles
for each row execute function public.close_deleted_user_surveys();

create or replace function public.admin_actor_name()
returns text language plpgsql security definer stable set search_path = public
as $$
declare v_name text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Solo un administrador puede realizar esta operación.';
  end if;
  select concat_ws(' ', p.first_name, nullif(p.middle_name, ''), p.paternal_surname, p.maternal_surname)
  into v_name from public.profiles p where p.id = auth.uid() and p.status = 'active';
  if v_name is null then raise exception 'El administrador no tiene un perfil activo.'; end if;
  return v_name;
end;
$$;

create or replace function public.assign_workstation(p_workstation_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_actor text := public.admin_actor_name();
begin
  if not exists (select 1 from public.workstations where id = p_workstation_id and is_active) then
    raise exception 'La mesa no existe o está inactiva.';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and status = 'active') then
    raise exception 'El usuario no existe o está inactivo.';
  end if;
  if exists (select 1 from public.workstation_assignments where workstation_id = p_workstation_id and ended_at is null) then
    raise exception 'La mesa ya está asignada a un usuario.';
  end if;
  if exists (select 1 from public.workstation_assignments where user_id = p_user_id and ended_at is null) then
    raise exception 'El usuario ya tiene una mesa asignada.';
  end if;
  insert into public.workstation_assignments (
    workstation_id, user_id, assigned_by, assigned_by_name
  ) values (p_workstation_id, p_user_id, auth.uid(), v_actor);
end;
$$;

create or replace function public.unassign_workstation(p_workstation_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_actor text := public.admin_actor_name();
begin
  if nullif(btrim(p_reason), '') is null then raise exception 'El motivo es obligatorio.'; end if;
  if exists (
    select 1 from public.attention_surveys s
    where s.workstation_id = p_workstation_id and s.status in ('PENDING_DECISION', 'SENT')
  ) then raise exception 'No se puede liberar una mesa con una encuesta pendiente.'; end if;

  update public.tablet_bindings set deactivated_at = now(), deactivated_by = auth.uid(),
    deactivated_by_name = v_actor, deactivation_reason = btrim(p_reason)
  where workstation_id = p_workstation_id and deactivated_at is null;

  update public.workstation_assignments set ended_at = now(), ended_by = auth.uid(),
    ended_by_name = v_actor
  where workstation_id = p_workstation_id and ended_at is null;
  if not found then raise exception 'La mesa no tiene una asignación activa.'; end if;
end;
$$;

create or replace function public.activate_tablet_binding()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid := public.current_session_id();
  v_workstation_id uuid;
  v_workstation_name text;
  v_binding public.tablet_bindings%rowtype;
begin
  if v_user_id is null or v_session_id is null then
    raise exception 'No existe una sesión válida para activar la tablet.';
  end if;
  select wa.workstation_id, w.name into v_workstation_id, v_workstation_name
  from public.workstation_assignments wa
  join public.workstations w on w.id = wa.workstation_id and w.is_active
  join public.profiles p on p.id = wa.user_id and p.status = 'active'
  where wa.user_id = v_user_id and wa.ended_at is null;
  if not found then raise exception 'No tienes una mesa de trabajo activa asignada.'; end if;

  perform 1 from public.workstations where id = v_workstation_id for update;
  select * into v_binding from public.tablet_bindings
  where workstation_id = v_workstation_id and deactivated_at is null;
  if found then
    if v_binding.user_id = v_user_id and v_binding.session_id = v_session_id then
      update public.tablet_bindings set last_seen_at = now() where id = v_binding.id;
      return jsonb_build_object('id', v_binding.id, 'workstationId', v_workstation_id,
        'workstationName', v_workstation_name, 'activatedAt', v_binding.activated_at);
    end if;
    raise exception 'La mesa ya tiene otra tablet activa. Desvincúlala antes de continuar.';
  end if;

  insert into public.tablet_bindings (workstation_id, user_id, session_id)
  values (v_workstation_id, v_user_id, v_session_id) returning * into v_binding;
  return jsonb_build_object('id', v_binding.id, 'workstationId', v_workstation_id,
    'workstationName', v_workstation_name, 'activatedAt', v_binding.activated_at);
end;
$$;

create or replace function public.get_current_tablet_binding()
returns jsonb language plpgsql security definer stable set search_path = public
as $$
declare v_result jsonb;
begin
  select jsonb_build_object('id', tb.id, 'workstationId', tb.workstation_id,
    'workstationName', w.name, 'activatedAt', tb.activated_at)
  into v_result
  from public.tablet_bindings tb join public.workstations w on w.id = tb.workstation_id
  where tb.user_id = auth.uid() and tb.session_id = public.current_session_id()
    and tb.deactivated_at is null;
  return v_result;
end;
$$;

create or replace function public.deactivate_current_tablet(p_reason text default 'Cierre de sesión en tablet')
returns void language plpgsql security definer set search_path = public
as $$
declare v_name text;
begin
  select concat_ws(' ', first_name, nullif(middle_name, ''), paternal_surname, maternal_surname)
  into v_name from public.profiles where id = auth.uid();
  update public.tablet_bindings set deactivated_at = now(), deactivated_by = auth.uid(),
    deactivated_by_name = coalesce(v_name, 'Usuario'),
    deactivation_reason = coalesce(nullif(btrim(p_reason), ''), 'Cierre de sesión en tablet')
  where user_id = auth.uid() and session_id = public.current_session_id() and deactivated_at is null;
end;
$$;

create or replace function public.force_deactivate_tablet(p_workstation_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_actor text := public.admin_actor_name();
begin
  if nullif(btrim(p_reason), '') is null then raise exception 'El motivo es obligatorio.'; end if;
  update public.tablet_bindings set deactivated_at = now(), deactivated_by = auth.uid(),
    deactivated_by_name = v_actor, deactivation_reason = btrim(p_reason)
  where workstation_id = p_workstation_id and deactivated_at is null;
  if not found then raise exception 'La mesa no tiene una tablet activa.'; end if;
end;
$$;

create or replace function public.send_attention_survey(p_attention_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_survey public.attention_surveys%rowtype; v_binding_id uuid;
begin
  if public.is_active_tablet_session() then raise exception 'Operación no permitida desde la tablet.'; end if;
  select s.* into v_survey from public.attention_surveys s
  join public.customer_attentions ca on ca.id = s.attention_id and ca.status = 'ACTIVE'
  where s.attention_id = p_attention_id and s.requested_by = auth.uid() for update of s;
  if not found then raise exception 'La encuesta no existe o no te pertenece.'; end if;
  if v_survey.status <> 'PENDING_DECISION' then raise exception 'La encuesta ya fue enviada o cerrada.'; end if;
  select tb.id into v_binding_id from public.tablet_bindings tb
  where tb.workstation_id = v_survey.workstation_id and tb.user_id = auth.uid()
    and tb.deactivated_at is null;
  if v_binding_id is null then raise exception 'No tienes una tablet activa vinculada a esta mesa.'; end if;
  update public.attention_surveys set status = 'SENT', sent_binding_id = v_binding_id, sent_at = now()
  where id = v_survey.id and status = 'PENDING_DECISION';
end;
$$;

create or replace function public.get_current_operator_survey()
returns jsonb language sql security definer stable set search_path = public
as $$
  select jsonb_build_object('attentionId', ca.id, 'racCode', ca.rac_code, 'status', s.status)
  from public.attention_surveys s
  join public.customer_attentions ca on ca.id = s.attention_id
  where s.requested_by = auth.uid() and s.status in ('PENDING_DECISION', 'SENT')
    and not public.is_active_tablet_session()
  order by s.created_at desc limit 1
$$;

create or replace function public.get_attention_survey_status(p_attention_id uuid)
returns text language sql security definer stable set search_path = public
as $$
  select s.status from public.attention_surveys s
  where s.attention_id = p_attention_id
    and (s.requested_by = auth.uid() or public.is_admin())
    and not public.is_active_tablet_session()
$$;

create or replace function public.skip_attention_survey(p_attention_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if public.is_active_tablet_session() then raise exception 'Operación no permitida desde la tablet.'; end if;
  update public.attention_surveys set status = 'SKIPPED', closed_by = auth.uid(),
    closed_by_name = requested_by_name, closed_at = now(), closed_reason = 'Omitida por el usuario que registró la atención'
  where attention_id = p_attention_id and requested_by = auth.uid() and status = 'PENDING_DECISION';
  if not found then raise exception 'La encuesta no existe, no te pertenece o ya fue enviada/cerrada.'; end if;
end;
$$;

create or replace function public.get_current_tablet_survey()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_result jsonb;
begin
  update public.tablet_bindings set last_seen_at = now()
  where user_id = auth.uid() and session_id = public.current_session_id() and deactivated_at is null;
  select jsonb_build_object('id', s.id, 'status', s.status, 'sentAt', s.sent_at)
  into v_result
  from public.attention_surveys s
  join public.tablet_bindings tb on tb.workstation_id = s.workstation_id
    and tb.user_id = auth.uid() and tb.session_id = public.current_session_id()
    and tb.deactivated_at is null
  where s.status = 'SENT'
  order by s.sent_at limit 1;
  return v_result;
end;
$$;

create or replace function public.answer_tablet_survey(p_survey_id uuid, p_response text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if p_response not in ('VERY_SATISFIED', 'SATISFIED', 'DISSATISFIED', 'VERY_DISSATISFIED') then
    raise exception 'La respuesta seleccionada no es válida.';
  end if;
  update public.attention_surveys s set status = 'COMPLETED', response = p_response, completed_at = now()
  from public.tablet_bindings tb
  where s.id = p_survey_id and s.status = 'SENT'
    and tb.workstation_id = s.workstation_id and tb.user_id = auth.uid()
    and tb.session_id = public.current_session_id() and tb.deactivated_at is null;
  if not found then raise exception 'La encuesta ya fue cerrada o no pertenece a esta tablet.'; end if;
end;
$$;

create or replace function public.skip_tablet_survey(p_survey_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.attention_surveys s set status = 'SKIPPED', closed_by = auth.uid(),
    closed_by_name = 'Cliente en tablet', closed_at = now(), closed_reason = 'Omitida desde la tablet'
  from public.tablet_bindings tb
  where s.id = p_survey_id and s.status = 'SENT'
    and tb.workstation_id = s.workstation_id and tb.user_id = auth.uid()
    and tb.session_id = public.current_session_id() and tb.deactivated_at is null;
  if not found then raise exception 'La encuesta ya fue cerrada o no pertenece a esta tablet.'; end if;
end;
$$;

create or replace function public.conclude_attention_referral(p_referral_id uuid, p_conclusion text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_actor_name text;
begin
  if auth.uid() is null or public.is_active_tablet_session() then
    raise exception 'No hay una sesión de usuario válida.';
  end if;
  if nullif(btrim(p_conclusion), '') is null then
    raise exception 'La conclusión de la derivación es obligatoria.';
  end if;
  select concat_ws(' ', p.first_name, nullif(p.middle_name, ''), p.paternal_surname, p.maternal_surname)
  into v_actor_name
  from public.profiles p
  join public.attention_referrals ar on ar.destination_area_id = p.area_id
  join public.customer_attentions ca on ca.id = ar.attention_id and ca.status = 'ACTIVE'
  where p.id = auth.uid() and p.status = 'active' and ar.id = p_referral_id and ar.status = 'PENDING';
  if not found then
    raise exception 'No perteneces al área de destino o la derivación ya no está pendiente.';
  end if;
  update public.attention_referrals set status = 'RESOLVED', conclusion = btrim(p_conclusion),
    concluded_by = auth.uid(), concluded_by_name = v_actor_name, concluded_at = now()
  where id = p_referral_id and status = 'PENDING';
  if not found then raise exception 'La derivación ya fue cerrada.'; end if;
end;
$$;

create or replace function public.disable_attention_referral(p_referral_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_actor text := public.admin_actor_name();
begin
  if nullif(btrim(p_reason), '') is null then raise exception 'El motivo es obligatorio.'; end if;
  update public.attention_referrals set status = 'DISABLED', disabled_reason = btrim(p_reason),
    disabled_by = auth.uid(), disabled_by_name = v_actor, disabled_at = now()
  where id = p_referral_id and status = 'PENDING';
  if not found then raise exception 'La derivación ya fue cerrada o no existe.'; end if;
end;
$$;

create or replace function public.prevent_pending_referral_area_delete()
returns trigger language plpgsql set search_path = public
as $$
begin
  if exists (select 1 from public.attention_referrals ar
    where ar.destination_area_id = old.id and ar.status = 'PENDING') then
    raise exception 'No se puede eliminar un área con derivaciones pendientes.';
  end if;
  return old;
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
    raise exception 'No tienes permiso para consultar el buzón.';
  end if;
  select p.area_id into v_user_area
  from public.profiles p
  where p.id = auth.uid()
    and p.status = 'active';
  if not v_is_admin and v_user_area is null then return; end if;

  return query
  select ar.id, ca.id, ca.rac_code, c.dni,
    concat_ws(' ', c.first_name, nullif(c.middle_name, ''), c.paternal_surname, c.maternal_surname),
    ar.destination_area_id, ar.destination_area_name, ar.referred_by_name, ar.referred_at,
    count(*) over()
  from public.attention_referrals ar
  join public.customer_attentions ca on ca.id = ar.attention_id and ca.status = 'ACTIVE'
  join public.clients c on c.id = ca.client_id
  where ar.status = 'PENDING'
    and (v_is_admin or ar.destination_area_id = v_user_area)
    and (not v_is_admin or p_area_id is null or ar.destination_area_id = p_area_id)
    and (coalesce(btrim(p_search), '') = ''
      or ca.rac_code ilike '%' || btrim(p_search) || '%'
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
  select ca.id, ca.rac_code, ca.status, ca.requester_type, c.dni,
    concat_ws(' ', c.first_name, nullif(c.middle_name, ''), c.paternal_surname, c.maternal_surname),
    sc.name, ca.created_by_name, ca.created_at, coalesce(s.status, 'NONE'),
    coalesce(ar.status, 'NONE'), ar.destination_area_id, ar.destination_area_name, count(*) over()
  from public.customer_attentions ca
  join public.clients c on c.id = ca.client_id
  join public.service_channels sc on sc.id = ca.service_channel_id
  left join public.attention_surveys s on s.attention_id = ca.id
  left join public.attention_referrals ar on ar.attention_id = ca.id
  where (ca.status = 'ACTIVE' or v_is_admin)
    and (coalesce(btrim(p_search), '') = ''
      or ca.rac_code ilike '%' || btrim(p_search) || '%'
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

create or replace function public.broadcast_attention_survey_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('surveyId', new.id, 'status', new.status),
    'survey_changed', 'workstation:' || new.workstation_id::text, true
  );
  perform realtime.send(
    jsonb_build_object('surveyId', new.id, 'status', new.status),
    'survey_changed', 'operator:' || new.requested_by::text, true
  );
  return new;
exception when undefined_function then
  return new;
end;
$$;

create trigger attention_surveys_broadcast_change
after insert or update on public.attention_surveys
for each row execute function public.broadcast_attention_survey_change();

alter table public.workstations enable row level security;
alter table public.workstation_assignments enable row level security;
alter table public.tablet_bindings enable row level security;
alter table public.attention_surveys enable row level security;

grant select, insert, update on public.workstations to authenticated;
grant select on public.workstation_assignments to authenticated;
grant select on public.tablet_bindings to authenticated;
grant select on public.attention_surveys to authenticated;

create policy "workstations_select_admin" on public.workstations
for select to authenticated using (public.is_admin() and not public.is_active_tablet_session());
create policy "workstations_insert_admin" on public.workstations
for insert to authenticated with check (public.is_admin() and not public.is_active_tablet_session());
create policy "workstations_update_admin" on public.workstations
for update to authenticated using (public.is_admin() and not public.is_active_tablet_session())
with check (public.is_admin() and not public.is_active_tablet_session());

create policy "workstation_assignments_select" on public.workstation_assignments
for select to authenticated using (
  (public.is_admin() and not public.is_active_tablet_session())
  or user_id = auth.uid()
);

create policy "tablet_bindings_select" on public.tablet_bindings
for select to authenticated using (
  (public.is_admin() and not public.is_active_tablet_session())
  or (user_id = auth.uid() and session_id = public.current_session_id())
);

create policy "attention_surveys_select" on public.attention_surveys
for select to authenticated using (
  (not public.is_active_tablet_session() and (requested_by = auth.uid() or public.is_admin()))
  or exists (
    select 1 from public.tablet_bindings tb
    where tb.workstation_id = attention_surveys.workstation_id
      and tb.user_id = auth.uid() and tb.session_id = public.current_session_id()
      and tb.deactivated_at is null
  )
);

drop policy if exists "attention_referrals_select_visible_attention" on public.attention_referrals;
create policy "attention_referrals_select_authorized" on public.attention_referrals
for select to authenticated using (
  not public.is_active_tablet_session()
  and exists (
    select 1 from public.customer_attentions ca
    where ca.id = attention_id and (ca.status = 'ACTIVE' or public.is_admin())
      and (
        public.is_admin()
        or ca.created_by = auth.uid()
        or destination_area_id = (select p.area_id from public.profiles p where p.id = auth.uid())
      )
  )
);

create policy "clients_block_tablet" on public.clients as restrictive
for all to authenticated using (not public.is_active_tablet_session())
with check (not public.is_active_tablet_session());
create policy "service_channels_block_tablet" on public.service_channels as restrictive
for all to authenticated using (not public.is_active_tablet_session())
with check (not public.is_active_tablet_session());
create policy "consultation_types_block_tablet" on public.consultation_types as restrictive
for all to authenticated using (not public.is_active_tablet_session())
with check (not public.is_active_tablet_session());
create policy "consultation_topics_block_tablet" on public.consultation_topics as restrictive
for all to authenticated using (not public.is_active_tablet_session())
with check (not public.is_active_tablet_session());
create policy "kinship_types_block_tablet" on public.kinship_types as restrictive
for all to authenticated using (not public.is_active_tablet_session())
with check (not public.is_active_tablet_session());
create policy "customer_attentions_block_tablet" on public.customer_attentions as restrictive
for all to authenticated using (not public.is_active_tablet_session())
with check (not public.is_active_tablet_session());
create policy "attention_topics_block_tablet" on public.attention_topics as restrictive
for all to authenticated using (not public.is_active_tablet_session())
with check (not public.is_active_tablet_session());
create policy "attention_referrals_block_tablet" on public.attention_referrals as restrictive
for all to authenticated using (not public.is_active_tablet_session())
with check (not public.is_active_tablet_session());

drop policy if exists "tablet_receive_workstation_broadcasts" on realtime.messages;
create policy "tablet_receive_workstation_broadcasts" on realtime.messages
for select to authenticated using (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1 from public.tablet_bindings tb
    where tb.user_id = auth.uid() and tb.session_id = public.current_session_id()
      and tb.deactivated_at is null
      and realtime.topic() = 'workstation:' || tb.workstation_id::text
  )
);

drop policy if exists "operator_receive_survey_broadcasts" on realtime.messages;
create policy "operator_receive_survey_broadcasts" on realtime.messages
for select to authenticated using (
  realtime.messages.extension = 'broadcast'
  and not public.is_active_tablet_session()
  and realtime.topic() = 'operator:' || auth.uid()::text
);

revoke execute on function public.current_session_id() from public, anon;
revoke execute on function public.is_active_tablet_session() from public, anon;
revoke execute on function public.active_workstation_for_user(uuid) from public, anon;
revoke execute on function public.assign_workstation(uuid, uuid) from public, anon;
revoke execute on function public.unassign_workstation(uuid, text) from public, anon;
revoke execute on function public.activate_tablet_binding() from public, anon;
revoke execute on function public.get_current_tablet_binding() from public, anon;
revoke execute on function public.deactivate_current_tablet(text) from public, anon;
revoke execute on function public.force_deactivate_tablet(uuid, text) from public, anon;
revoke execute on function public.send_attention_survey(uuid) from public, anon;
revoke execute on function public.get_current_operator_survey() from public, anon;
revoke execute on function public.get_attention_survey_status(uuid) from public, anon;
revoke execute on function public.skip_attention_survey(uuid) from public, anon;
revoke execute on function public.get_current_tablet_survey() from public, anon;
revoke execute on function public.answer_tablet_survey(uuid, text) from public, anon;
revoke execute on function public.skip_tablet_survey(uuid) from public, anon;
revoke execute on function public.disable_attention_referral(uuid, text) from public, anon;
revoke execute on function public.list_referral_inbox(integer, integer, text, uuid) from public, anon;
revoke execute on function public.list_customer_attentions_v2(integer, integer, text, text, text, uuid) from public, anon;

grant execute on function public.current_session_id() to authenticated;
grant execute on function public.is_active_tablet_session() to authenticated;
grant execute on function public.active_workstation_for_user(uuid) to authenticated;
grant execute on function public.assign_workstation(uuid, uuid) to authenticated;
grant execute on function public.unassign_workstation(uuid, text) to authenticated;
grant execute on function public.activate_tablet_binding() to authenticated;
grant execute on function public.get_current_tablet_binding() to authenticated;
grant execute on function public.deactivate_current_tablet(text) to authenticated;
grant execute on function public.force_deactivate_tablet(uuid, text) to authenticated;
grant execute on function public.send_attention_survey(uuid) to authenticated;
grant execute on function public.get_current_operator_survey() to authenticated;
grant execute on function public.get_attention_survey_status(uuid) to authenticated;
grant execute on function public.skip_attention_survey(uuid) to authenticated;
grant execute on function public.get_current_tablet_survey() to authenticated;
grant execute on function public.answer_tablet_survey(uuid, text) to authenticated;
grant execute on function public.skip_tablet_survey(uuid) to authenticated;
grant execute on function public.disable_attention_referral(uuid, text) to authenticated;
grant execute on function public.list_referral_inbox(integer, integer, text, uuid) to authenticated;
grant execute on function public.list_customer_attentions_v2(integer, integer, text, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;




