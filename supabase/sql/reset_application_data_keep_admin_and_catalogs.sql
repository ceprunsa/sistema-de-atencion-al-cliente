-- REINICIO CONTROLADO DE DATOS PARA LA PUESTA EN PRODUCCION
--
-- Conserva exclusivamente:
--   * el usuario administrador csullcap@unsa.edu.pe y su perfil;
--   * los catalogos public.roles, public.consultation_types,
--     public.consultation_topics y public.kinship_types;
--   * la estructura, funciones, politicas y triggers de la base.
--
-- Elimina usuarios restantes (incluidos auth.users), invitaciones, areas,
-- medios, procesos de admision y todos los datos operativos.
--
-- ADVERTENCIA: la eliminacion es irreversible. Crea una copia de seguridad
-- antes de ejecutar este archivo en el SQL Editor de Supabase.

begin;

-- La transaccion se detiene antes de eliminar datos si el usuario que debe
-- conservarse no existe, no tiene perfil o no posee el rol ADMIN.
do $$
declare
  v_admin_email constant text := 'csullcap@unsa.edu.pe';
  v_admin_id uuid;
begin
  select au.id
  into v_admin_id
  from auth.users au
  where lower(btrim(au.email)) = v_admin_email;

  if v_admin_id is null then
    raise exception 'Reinicio cancelado: no existe el usuario % en auth.users.', v_admin_email;
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_admin_id
  ) then
    raise exception 'Reinicio cancelado: el usuario % no tiene perfil.', v_admin_email;
  end if;

  if not exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = v_admin_id
      and r.key = 'ADMIN'
  ) then
    raise exception 'Reinicio cancelado: el usuario % no posee el rol ADMIN.', v_admin_email;
  end if;
end;
$$;

-- Todas las tablas relacionadas se incluyen en la misma sentencia para
-- respetar sus claves foraneas sin utilizar CASCADE sobre tablas no previstas.
truncate table
  public.referral_surveys,
  public.attention_surveys,
  public.attention_admission_processes,
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
  public.service_channels,
  public.admission_processes
restart identity;

-- El administrador debe quedar sin area porque el catalogo se reiniciara.
update public.profiles p
set area_id = null
where p.id = (
  select au.id
  from auth.users au
  where lower(btrim(au.email)) = 'csullcap@unsa.edu.pe'
);

-- Borrar en auth.users activa la cascada definida hacia profiles y user_roles.
delete from auth.users au
where au.id <> (
  select kept.id
  from auth.users kept
  where lower(btrim(kept.email)) = 'csullcap@unsa.edu.pe'
);

-- Si el administrador tenia otro rol adicional, conservar solo ADMIN.
delete from public.user_roles ur
where ur.user_id = (
    select au.id
    from auth.users au
    where lower(btrim(au.email)) = 'csullcap@unsa.edu.pe'
  )
  and ur.role_id <> (
    select r.id
    from public.roles r
    where r.key = 'ADMIN'
  );

delete from public.areas;

-- Validacion final dentro de la misma transaccion. Cualquier incumplimiento
-- provoca rollback y evita dejar la base parcialmente reiniciada.
do $$
declare
  v_admin_email constant text := 'csullcap@unsa.edu.pe';
begin
  if (select count(*) from auth.users) <> 1
    or not exists (
      select 1 from auth.users au
      where lower(btrim(au.email)) = v_admin_email
    ) then
    raise exception 'Validacion fallida: auth.users no contiene exclusivamente al administrador esperado.';
  end if;

  if (select count(*) from public.profiles) <> 1
    or exists (select 1 from public.profiles where area_id is not null) then
    raise exception 'Validacion fallida: el perfil administrador no quedo como unico perfil sin area.';
  end if;

  if (select count(*) from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where r.key = 'ADMIN') <> 1
    or (select count(*) from public.user_roles) <> 1 then
    raise exception 'Validacion fallida: debe quedar una sola asignacion de rol ADMIN.';
  end if;

  if exists (select 1 from public.areas)
    or exists (select 1 from public.service_channels)
    or exists (select 1 from public.admission_processes)
    or exists (select 1 from public.clients)
    or exists (select 1 from public.customer_attentions)
    or exists (select 1 from public.workstations)
    or exists (select 1 from public.attention_referrals)
    or exists (select 1 from public.attention_surveys)
    or exists (select 1 from public.referral_surveys) then
    raise exception 'Validacion fallida: permanecen datos que debian eliminarse.';
  end if;
end;
$$;

commit;

-- Resumen visible al finalizar correctamente.
select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.areas) as areas,
  (select count(*) from public.roles) as roles,
  (select count(*) from public.user_roles) as user_role_assignments,
  (select count(*) from public.consultation_types) as consultation_types,
  (select count(*) from public.consultation_topics) as consultation_topics,
  (select count(*) from public.kinship_types) as kinship_types,
  (select count(*) from public.service_channels) as service_channels,
  (select count(*) from public.admission_processes) as admission_processes,
  (select count(*) from public.customer_attentions) as customer_attentions;
