-- Instalacion completa para un proyecto Supabase NUEVO.
-- Ejecutar una sola vez en SQL Editor antes de activar el Auth Hook.

begin;

create extension if not exists pgcrypto;

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key in ('ADMIN', 'USER')),
  name text not null unique
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  account_name text,
  first_name text not null check (btrim(first_name) <> ''),
  middle_name text,
  paternal_surname text not null check (btrim(paternal_surname) <> ''),
  maternal_surname text not null check (btrim(maternal_surname) <> ''),
  phone text,
  additional_email text,
  email text not null unique,
  photo_url text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_invitations (
  email text primary key,
  first_name text not null check (btrim(first_name) <> ''),
  middle_name text,
  paternal_surname text not null check (btrim(paternal_surname) <> ''),
  maternal_surname text not null check (btrim(maternal_surname) <> ''),
  phone text,
  additional_email text,
  role_name text not null check (btrim(role_name) <> ''),
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  primary key (user_id, role_id)
);

create index profiles_email_lower_idx on public.profiles (lower(email));
create unique index user_invitations_email_lower_idx
  on public.user_invitations (lower(email));
create index user_invitations_active_email_idx
  on public.user_invitations (lower(email), expires_at);
create index user_roles_role_id_idx on public.user_roles (role_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

insert into public.roles (key, name)
values ('ADMIN', 'Administrador'), ('USER', 'Usuario');

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.key = 'ADMIN'
  );
$$;

alter function public.is_admin() owner to postgres;
grant execute on function public.is_admin() to authenticated;

create or replace function public.accept_user_invitation(
  p_account_name text,
  p_photo_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
  v_invitation public.user_invitations%rowtype;
  v_role_id uuid;
begin
  if v_user_id is null or v_email is null then
    raise exception 'No hay una sesion autenticada.';
  end if;

  select ui.* into v_invitation
  from public.user_invitations ui
  where lower(ui.email) = lower(v_email)
    and (ui.expires_at is null or ui.expires_at > now());

  if v_invitation.email is null then
    raise exception 'No existe una invitacion activa para este correo.';
  end if;

  select r.id into v_role_id
  from public.roles r
  where lower(r.name) = lower(v_invitation.role_name);

  if v_role_id is null then
    raise exception 'El rol de la invitacion no existe.';
  end if;

  insert into public.profiles (
    id, account_name, first_name, middle_name, paternal_surname,
    maternal_surname, phone, additional_email, email, photo_url, status
  ) values (
    v_user_id, nullif(p_account_name, ''), v_invitation.first_name,
    v_invitation.middle_name, v_invitation.paternal_surname,
    v_invitation.maternal_surname, v_invitation.phone,
    v_invitation.additional_email, lower(v_email), nullif(p_photo_url, ''),
    'active'
  )
  on conflict (id) do update set
    account_name = coalesce(public.profiles.account_name, nullif(excluded.account_name, '')),
    first_name = excluded.first_name,
    middle_name = excluded.middle_name,
    paternal_surname = excluded.paternal_surname,
    maternal_surname = excluded.maternal_surname,
    phone = excluded.phone,
    additional_email = excluded.additional_email,
    email = excluded.email,
    photo_url = coalesce(nullif(excluded.photo_url, ''), public.profiles.photo_url),
    status = 'active';

  delete from public.user_roles where user_id = v_user_id;
  insert into public.user_roles (user_id, role_id)
  values (v_user_id, v_role_id);

  delete from public.user_invitations
  where lower(email) = lower(v_email);
end;
$$;

alter function public.accept_user_invitation(text, text) owner to postgres;
grant execute on function public.accept_user_invitation(text, text)
  to authenticated;

create or replace function public.hook_require_user_invitation(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_email text := lower(nullif(btrim(event -> 'user' ->> 'email'), ''));
begin
  if v_email is null then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 400,
        'message', 'No se pudo validar el correo del usuario.'
      )
    );
  end if;

  if not exists (
    select 1
    from public.user_invitations ui
    where lower(ui.email) = v_email
      and (ui.expires_at is null or ui.expires_at > now())
  ) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'No tienes una invitacion activa para ingresar.'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_invitations enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.roles to authenticated;
grant select, insert, update, delete on public.user_roles to authenticated;
grant select, insert, update, delete on public.user_invitations to authenticated;

create policy "profiles_select_own_or_admin" on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

create policy "profiles_update_own_or_admin" on public.profiles
for update to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

create policy "profiles_delete_admin" on public.profiles
for delete to authenticated using (public.is_admin());

create policy "roles_select_authenticated" on public.roles
for select to authenticated using (true);

create policy "roles_manage_admin" on public.roles
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "user_roles_select_own_or_admin" on public.user_roles
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "user_roles_insert_admin" on public.user_roles
for insert to authenticated with check (public.is_admin());

create policy "user_roles_delete_admin" on public.user_roles
for delete to authenticated using (public.is_admin());

create policy "user_invitations_select_own_or_admin"
on public.user_invitations for select to authenticated
using (lower(email) = lower(auth.jwt() ->> 'email') or public.is_admin());

create policy "user_invitations_insert_admin"
on public.user_invitations for insert to authenticated
with check (public.is_admin());

create policy "user_invitations_update_admin"
on public.user_invitations for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "user_invitations_delete_admin"
on public.user_invitations for delete to authenticated
using (public.is_admin());

grant usage on schema public to supabase_auth_admin;
grant select on public.user_invitations to supabase_auth_admin;
grant execute on function public.hook_require_user_invitation(jsonb)
  to supabase_auth_admin;
revoke execute on function public.hook_require_user_invitation(jsonb)
  from anon, authenticated, public;

create policy "user_invitations_select_auth_hook"
on public.user_invitations for select to supabase_auth_admin
using (true);

commit;
