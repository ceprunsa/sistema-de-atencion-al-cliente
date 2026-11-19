-- REINICIO EXCLUSIVO DEL HISTORIAL RAC
--
-- Conserva:
--   * usuarios de auth, perfiles, roles e invitaciones;
--   * areas;
--   * clientes;
--   * mesas, asignaciones y vinculaciones de tablet;
--   * medios de atencion;
--   * procesos de admision;
--   * tipos, temas y parentescos;
--   * registros y limites de consulta DNI.
--   * quejas, decisiones SAC, seguimientos y sus comunicaciones;
--
-- Elimina:
--   * atenciones RAC y su correlativo;
--   * temas y procesos seleccionados en cada atencion;
--   * derivaciones;
--   * encuestas de atencion y derivacion;
--   * limites publicos vinculados a encuestas;
--   * correos en cola e intentos de entrega vinculados a eventos RAC.
--   * trabajos de exportacion RAC (los archivos del bucket se limpian por la Edge Function).
-- Las quejas vinculadas a un RAC se conservan como quejas independientes.
--
-- ADVERTENCIA: la eliminacion es irreversible. Crea una copia de seguridad
-- antes de ejecutar este archivo en el SQL Editor de Supabase.

begin;

-- Captura los conteos de toda la configuracion que debe permanecer. La
-- validacion final provoca rollback si cualquiera de estos datos cambia.
create temporary table rac_reset_preserved_counts
on commit drop
as
select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.roles) as roles,
  (select count(*) from public.user_roles) as user_roles,
  (select count(*) from public.user_invitations) as user_invitations,
  (select count(*) from public.areas) as areas,
  (select count(*) from public.clients) as clients,
  (select count(*) from public.workstations) as workstations,
  (select count(*) from public.workstation_assignments) as workstation_assignments,
  (select count(*) from public.tablet_bindings) as tablet_bindings,
  (select count(*) from public.service_channels) as service_channels,
  (select count(*) from public.admission_processes) as admission_processes,
  (select count(*) from public.consultation_types) as consultation_types,
  (select count(*) from public.consultation_topics) as consultation_topics,
  (select count(*) from public.kinship_types) as kinship_types,
  (select count(*) from public.dni_lookup_attempts) as dni_lookup_attempts,
  (select count(*) from public.dni_lookup_rate_limits) as dni_lookup_rate_limits,
  (select count(*) from public.complaint_settings) as complaint_settings,
  (select count(*) from public.complaint_counters) as complaint_counters,
  (select count(*) from public.sac_counters) as sac_counters,
  (select count(*) from public.complaints) as complaints,
  (select count(*) from public.complaint_action_versions) as complaint_action_versions,
  (select count(*) from public.complaint_response_tokens) as complaint_response_tokens,
  (select count(*) from public.complaint_closure_reviews) as complaint_closure_reviews,
  (select count(*) from public.complaint_sac_decisions) as complaint_sac_decisions,
  (select count(*) from public.corrective_action_requests) as corrective_action_requests,
  (select count(*) from public.complaint_communications) as complaint_communications,
  (select count(*) from public.complaint_events) as complaint_events,
  (select count(*) from public.email_outbox where aggregate_type = 'COMPLAINT')
    as complaint_outbox,
  (
    select count(*)
    from public.email_delivery_attempts eda
    join public.email_outbox eo on eo.id = eda.outbox_id
    where eo.aggregate_type = 'COMPLAINT'
  ) as complaint_delivery_attempts;

-- El RAC deja de existir, pero la queja y todo su expediente permanecen.
alter table public.complaints
  disable trigger complaints_guard_identity_update;
update public.complaints
set attention_id = null
where attention_id is not null;
alter table public.complaints
  enable trigger complaints_guard_identity_update;

-- Elimina exclusivamente la cola de los agregados RAC. Los intentos asociados
-- se eliminan por la clave foranea ON DELETE CASCADE.
delete from public.email_outbox
where aggregate_type in ('ATTENTION', 'REFERRAL');

-- Todas las dependencias del historial se incluyen expresamente. No se usa
-- CASCADE para impedir que una tabla futura sea borrada de manera silenciosa.
truncate table
  public.attention_export_jobs,
  public.referral_surveys,
  public.attention_surveys,
  public.attention_admission_processes,
  public.attention_referrals,
  public.attention_topics,
  public.customer_attentions,
  public.rac_counters,
  public.public_survey_rate_limits
restart identity;

do $$
begin
  if exists (select 1 from public.customer_attentions)
    or exists (select 1 from public.attention_topics)
    or exists (select 1 from public.attention_admission_processes)
    or exists (select 1 from public.attention_referrals)
    or exists (select 1 from public.attention_surveys)
    or exists (select 1 from public.referral_surveys)
    or exists (select 1 from public.rac_counters)
    or exists (select 1 from public.attention_export_jobs)
    or exists (
      select 1 from public.email_outbox
      where aggregate_type in ('ATTENTION', 'REFERRAL')
    )
    or exists (select 1 from public.public_survey_rate_limits) then
    raise exception 'Validacion fallida: permanecen datos relacionados con el historial RAC.';
  end if;

  if exists (
    select 1
    from pg_temp.rac_reset_preserved_counts b
    where b.auth_users <> (select count(*) from auth.users)
      or b.profiles <> (select count(*) from public.profiles)
      or b.roles <> (select count(*) from public.roles)
      or b.user_roles <> (select count(*) from public.user_roles)
      or b.user_invitations <> (select count(*) from public.user_invitations)
      or b.areas <> (select count(*) from public.areas)
      or b.clients <> (select count(*) from public.clients)
      or b.workstations <> (select count(*) from public.workstations)
      or b.workstation_assignments <> (select count(*) from public.workstation_assignments)
      or b.tablet_bindings <> (select count(*) from public.tablet_bindings)
      or b.service_channels <> (select count(*) from public.service_channels)
      or b.admission_processes <> (select count(*) from public.admission_processes)
      or b.consultation_types <> (select count(*) from public.consultation_types)
      or b.consultation_topics <> (select count(*) from public.consultation_topics)
      or b.kinship_types <> (select count(*) from public.kinship_types)
      or b.dni_lookup_attempts <> (select count(*) from public.dni_lookup_attempts)
      or b.dni_lookup_rate_limits <> (select count(*) from public.dni_lookup_rate_limits)
      or b.complaint_settings <> (select count(*) from public.complaint_settings)
      or b.complaint_counters <> (select count(*) from public.complaint_counters)
      or b.sac_counters <> (select count(*) from public.sac_counters)
      or b.complaints <> (select count(*) from public.complaints)
      or b.complaint_action_versions <> (select count(*) from public.complaint_action_versions)
      or b.complaint_response_tokens <> (select count(*) from public.complaint_response_tokens)
      or b.complaint_closure_reviews <> (select count(*) from public.complaint_closure_reviews)
      or b.complaint_sac_decisions <> (select count(*) from public.complaint_sac_decisions)
      or b.corrective_action_requests <> (select count(*) from public.corrective_action_requests)
      or b.complaint_communications <> (select count(*) from public.complaint_communications)
      or b.complaint_events <> (select count(*) from public.complaint_events)
      or b.complaint_outbox <> (
        select count(*) from public.email_outbox where aggregate_type = 'COMPLAINT'
      )
      or b.complaint_delivery_attempts <> (
        select count(*)
        from public.email_delivery_attempts eda
        join public.email_outbox eo on eo.id = eda.outbox_id
        where eo.aggregate_type = 'COMPLAINT'
      )
      or exists (
        select 1 from public.complaints where attention_id is not null
      )
  ) then
    raise exception 'Validacion fallida: se modificaron datos que debian conservarse.';
  end if;
end;
$$;

commit;

-- Resumen visible: todos los campos RAC deben ser cero y la configuracion
-- conservada debe mantener sus cantidades.
select
  (select count(*) from public.customer_attentions) as customer_attentions,
  (select count(*) from public.attention_referrals) as attention_referrals,
  (select count(*) from public.attention_surveys) as attention_surveys,
  (select count(*) from public.referral_surveys) as referral_surveys,
  (select count(*) from public.email_outbox where aggregate_type = 'COMPLAINT')
    as complaint_email_outbox_preserved,
  (
    select count(*)
    from public.email_delivery_attempts eda
    join public.email_outbox eo on eo.id = eda.outbox_id
    where eo.aggregate_type = 'COMPLAINT'
  ) as complaint_delivery_attempts_preserved,
  (select count(*) from public.rac_counters) as rac_counters,
  (select count(*) from auth.users) as auth_users_preserved,
  (select count(*) from public.profiles) as profiles_preserved,
  (select count(*) from public.clients) as clients_preserved,
  (select count(*) from public.areas) as areas_preserved,
  (select count(*) from public.workstations) as workstations_preserved,
  (select count(*) from public.service_channels) as service_channels_preserved,
  (select count(*) from public.admission_processes) as admission_processes_preserved;

