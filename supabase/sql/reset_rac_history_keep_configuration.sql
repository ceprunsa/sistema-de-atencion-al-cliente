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
--
-- Elimina:
--   * atenciones RAC y su correlativo;
--   * temas y procesos seleccionados en cada atencion;
--   * derivaciones;
--   * encuestas de atencion y derivacion;
--   * limites publicos vinculados a encuestas;
--   * correos en cola e intentos de entrega vinculados a esos eventos.
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
  (select count(*) from public.dni_lookup_rate_limits) as dni_lookup_rate_limits;

-- Todas las dependencias del historial se incluyen expresamente. No se usa
-- CASCADE para impedir que una tabla futura sea borrada de manera silenciosa.
truncate table
  public.referral_surveys,
  public.attention_surveys,
  public.attention_admission_processes,
  public.attention_referrals,
  public.attention_topics,
  public.customer_attentions,
  public.rac_counters,
  public.email_delivery_attempts,
  public.email_outbox,
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
    or exists (select 1 from public.email_outbox)
    or exists (select 1 from public.email_delivery_attempts)
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
  (select count(*) from public.email_outbox) as email_outbox,
  (select count(*) from public.email_delivery_attempts) as email_delivery_attempts,
  (select count(*) from public.rac_counters) as rac_counters,
  (select count(*) from auth.users) as auth_users_preserved,
  (select count(*) from public.profiles) as profiles_preserved,
  (select count(*) from public.clients) as clients_preserved,
  (select count(*) from public.areas) as areas_preserved,
  (select count(*) from public.workstations) as workstations_preserved,
  (select count(*) from public.service_channels) as service_channels_preserved,
  (select count(*) from public.admission_processes) as admission_processes_preserved;

