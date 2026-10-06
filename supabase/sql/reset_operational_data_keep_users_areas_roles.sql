-- REINICIO DE DATOS DE LA APLICACION
--
-- ADVERTENCIA: este script elimina de forma irreversible todos los datos
-- operativos y catalogos, conservando exclusivamente:
--   * auth.users
--   * public.profiles
--   * public.areas
--   * public.roles
--   * public.user_roles
--   * public.consultation_types
--   * public.consultation_topics
--   * public.kinship_types
--
-- Tambien conserva la estructura completa de la base, funciones, politicas,
-- triggers y Edge Functions. No lo ejecutes sin una copia de seguridad.

begin;

truncate table
  public.referral_surveys,
  public.attention_surveys,
  public.attention_referrals,
  public.attention_topics,
  public.customer_attentions,
  public.clients,
  public.rac_counters,
  public.tablet_bindings,
  public.workstation_assignments,
  public.workstations,
  public.email_delivery_attempts,
  public.email_outbox,
  public.dni_lookup_attempts,
  public.dni_lookup_rate_limits,
  public.public_survey_rate_limits,
  public.user_invitations,
  public.service_channels
restart identity;

commit;

-- Resumen de los datos que deben permanecer.
select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.areas) as areas,
  (select count(*) from public.roles) as roles,
  (select count(*) from public.user_roles) as user_role_assignments,
  (select count(*) from public.consultation_types) as consultation_types,
  (select count(*) from public.consultation_topics) as consultation_topics,
  (select count(*) from public.kinship_types) as kinship_types;
