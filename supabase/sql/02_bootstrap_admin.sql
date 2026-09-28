-- Ejecutar después de 01_setup.sql y antes del primer ingreso.
-- CAMBIA los valores del bloque declare para el administrador inicial.

do $$
declare
  v_email text := lower('CAMBIAR_ADMIN@EJEMPLO.COM');
  v_first_name text := 'Administrador';
  v_middle_name text := null;
  v_paternal_surname text := 'Principal';
  v_maternal_surname text := 'Sistema';
begin
  if v_email = 'cambiar_admin@ejemplo.com' then
    raise exception 'Debes configurar el correo del administrador inicial.';
  end if;

  insert into public.user_invitations (
    email,
    first_name,
    middle_name,
    paternal_surname,
    maternal_surname,
    role_name
  ) values (
    v_email,
    v_first_name,
    v_middle_name,
    v_paternal_surname,
    v_maternal_surname,
    'Administrador'
  )
  on conflict (email) do update set
    first_name = excluded.first_name,
    middle_name = excluded.middle_name,
    paternal_surname = excluded.paternal_surname,
    maternal_surname = excluded.maternal_surname,
    role_name = excluded.role_name,
    expires_at = null;
end;
$$;
