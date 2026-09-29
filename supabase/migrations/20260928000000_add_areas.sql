-- Aplicar una sola vez únicamente a proyectos que ya ejecutaron 01_setup.sql
-- antes de incorporar la gestión de áreas.

begin;

create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> '')
);

create unique index if not exists areas_name_lower_idx
  on public.areas (lower(btrim(name)));

alter table public.profiles add column if not exists area_id uuid;
alter table public.user_invitations add column if not exists area_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_area_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_area_id_fkey
      foreign key (area_id) references public.areas(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'user_invitations_area_id_fkey'
      and conrelid = 'public.user_invitations'::regclass
  ) then
    alter table public.user_invitations
      add constraint user_invitations_area_id_fkey
      foreign key (area_id) references public.areas(id) on delete set null;
  end if;
end;
$$;

create index if not exists profiles_area_id_idx on public.profiles (area_id);
create index if not exists user_invitations_area_id_idx
  on public.user_invitations (area_id);

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
    id, area_id, account_name, first_name, middle_name, paternal_surname,
    maternal_surname, phone, additional_email, email, photo_url, status
  ) values (
    v_user_id, v_invitation.area_id, nullif(p_account_name, ''),
    v_invitation.first_name, v_invitation.middle_name,
    v_invitation.paternal_surname, v_invitation.maternal_surname,
    v_invitation.phone, v_invitation.additional_email, lower(v_email),
    nullif(p_photo_url, ''), 'active'
  )
  on conflict (id) do update set
    area_id = excluded.area_id,
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

alter table public.areas enable row level security;
grant select, insert, update, delete on public.areas to authenticated;

drop policy if exists "areas_select_authenticated" on public.areas;
create policy "areas_select_authenticated" on public.areas
for select to authenticated using (true);

drop policy if exists "areas_insert_admin" on public.areas;
create policy "areas_insert_admin" on public.areas
for insert to authenticated with check (public.is_admin());

drop policy if exists "areas_update_admin" on public.areas;
create policy "areas_update_admin" on public.areas
for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "areas_delete_admin" on public.areas;
create policy "areas_delete_admin" on public.areas
for delete to authenticated using (public.is_admin());

commit;
