-- Etapa 1 del modulo de quejas: modelo, seguridad y configuracion base.
-- Ejecutar despues de 19_client_management.sql en proyectos nuevos.
begin;

alter table public.areas
  add column if not exists is_active boolean not null default true,
  add column if not exists disabled_by uuid references public.profiles(id) on delete set null,
  add column if not exists disabled_by_name text,
  add column if not exists disabled_at timestamptz;

alter table public.areas drop constraint if exists areas_active_state_check;
alter table public.areas add constraint areas_active_state_check check (
  (is_active and disabled_by is null and disabled_by_name is null and disabled_at is null)
  or (not is_active and disabled_at is not null
    and nullif(btrim(disabled_by_name), '') is not null)
);

create table public.complaint_settings (
  singleton_id smallint primary key default 1 check (singleton_id = 1),
  closure_area_id uuid not null unique references public.areas(id) on delete restrict,
  configured_by uuid references public.profiles(id) on delete set null,
  configured_by_name text not null check (nullif(btrim(configured_by_name), '') is not null),
  configured_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.complaint_counters (
  complaint_year integer primary key check (complaint_year between 2000 and 9999),
  last_value bigint not null check (last_value > 0)
);

create table public.sac_counters (
  sac_year integer primary key check (sac_year between 2000 and 9999),
  last_value bigint not null check (last_value > 0)
);

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  complaint_year integer not null check (complaint_year between 2000 and 9999),
  complaint_number bigint not null check (complaint_number > 0),
  complaint_code text not null unique check (complaint_code ~ '^RQ-[0-9]+-[0-9]{4}$'),
  client_id uuid not null references public.clients(id) on delete restrict,
  attention_id uuid references public.customer_attentions(id) on delete restrict,
  service_channel_id uuid not null references public.service_channels(id) on delete restrict,
  responsible_area_id uuid not null references public.areas(id) on delete restrict,
  closure_area_id uuid not null references public.areas(id) on delete restrict,
  description text not null check (nullif(btrim(description), '') is not null),
  status text not null default 'PENDING_MANAGEMENT' check (status in (
    'PENDING_MANAGEMENT', 'IN_MANAGEMENT', 'WAITING_CLIENT_RESPONSE',
    'RETURNED_BY_CLIENT', 'PENDING_CLOSURE_REVIEW', 'RETURNED_BY_CLOSURE',
    'PENDING_SAC_EVALUATION', 'CLOSED_AGREED', 'CLOSED_NO_RESPONSE'
  )),
  current_action_version integer not null default 0 check (current_action_version >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text not null check (nullif(btrim(created_by_name), '') is not null),
  created_by_email text not null check (nullif(btrim(created_by_email), '') is not null),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (complaint_year, complaint_number),
  check (
    (status in ('CLOSED_AGREED', 'CLOSED_NO_RESPONSE') and closed_at is not null)
    or (status not in ('CLOSED_AGREED', 'CLOSED_NO_RESPONSE') and closed_at is null)
  )
);

create table public.complaint_action_versions (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  proceeds boolean not null,
  analysis text not null check (nullif(btrim(analysis), '') is not null),
  actions text not null check (nullif(btrim(actions), '') is not null),
  client_explanation text,
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_by_name text not null check (nullif(btrim(recorded_by_name), '') is not null),
  recorded_at timestamptz not null default now(),
  unique (complaint_id, version_number),
  check (proceeds or nullif(btrim(client_explanation), '') is not null)
);

create table public.complaint_response_tokens (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete restrict,
  action_version_id uuid not null unique
    references public.complaint_action_versions(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'QUEUED' check (status in (
    'QUEUED', 'SENT', 'AGREED', 'DISAGREED', 'EXPIRED',
    'INVALIDATED', 'DELIVERY_FAILED'
  )),
  sent_at timestamptz,
  expires_at timestamptz,
  responded_at timestamptz,
  disagreement_reason text,
  created_at timestamptz not null default now(),
  check (
    (status = 'QUEUED' and sent_at is null and expires_at is null
      and responded_at is null and disagreement_reason is null)
    or
    (status = 'SENT' and sent_at is not null
      and expires_at = sent_at + interval '7 days'
      and responded_at is null and disagreement_reason is null)
    or
    (status = 'AGREED' and sent_at is not null and expires_at is not null
      and responded_at is not null and disagreement_reason is null)
    or
    (status = 'DISAGREED' and sent_at is not null and expires_at is not null
      and responded_at is not null
      and nullif(btrim(disagreement_reason), '') is not null)
    or
    (status = 'EXPIRED' and sent_at is not null and expires_at is not null
      and responded_at is null and disagreement_reason is null)
    or
    (status in ('INVALIDATED', 'DELIVERY_FAILED')
      and responded_at is null and disagreement_reason is null)
  )
);

create unique index complaint_response_tokens_one_open_idx
  on public.complaint_response_tokens (complaint_id)
  where status in ('QUEUED', 'SENT');

create table public.complaint_closure_reviews (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete restrict,
  review_number integer not null check (review_number > 0),
  is_adequate boolean not null,
  observations text not null check (nullif(btrim(observations), '') is not null),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_by_name text not null check (nullif(btrim(reviewed_by_name), '') is not null),
  reviewed_at timestamptz not null default now(),
  unique (complaint_id, review_number)
);

create table public.complaint_sac_decisions (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null unique references public.complaints(id) on delete restrict,
  should_create_sac boolean not null,
  comments text not null check (nullif(btrim(comments), '') is not null),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_by_name text not null check (nullif(btrim(decided_by_name), '') is not null),
  decided_at timestamptz not null default now()
);

create table public.corrective_action_requests (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null unique references public.complaints(id) on delete restrict,
  sac_year integer not null check (sac_year between 2000 and 9999),
  sac_number bigint not null check (sac_number > 0),
  sac_code text not null unique check (sac_code ~ '^SAC-[0-9]+-[0-9]{4}$'),
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text not null check (nullif(btrim(created_by_name), '') is not null),
  created_at timestamptz not null default now(),
  unique (sac_year, sac_number)
);

create table public.complaint_communications (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete restrict,
  action_version_id uuid references public.complaint_action_versions(id) on delete restrict,
  communication_type text not null check (communication_type in (
    'COMPLAINT_CREATED', 'CLIENT_RESPONSE_REQUESTED', 'CLIENT_AGREED',
    'CLIENT_DISAGREED', 'CLIENT_RESPONSE_EXPIRED', 'CLOSURE_RETURNED'
  )),
  recipient_email text not null check (nullif(btrim(recipient_email), '') is not null),
  idempotency_key text not null unique
    check (length(btrim(idempotency_key)) between 8 and 250),
  outbox_id uuid unique references public.email_outbox(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.complaint_events (
  id bigint generated always as identity primary key,
  complaint_id uuid not null references public.complaints(id) on delete restrict,
  event_type text not null check (event_type in (
    'CREATED', 'MANAGEMENT_STARTED', 'ACTION_VERSION_RECORDED',
    'CLIENT_NOTIFICATION_QUEUED', 'CLIENT_NOTIFICATION_SENT',
    'CLIENT_NOTIFICATION_FAILED', 'CLIENT_AGREED', 'CLIENT_DISAGREED',
    'CLIENT_RESPONSE_EXPIRED', 'CLOSURE_REVIEWED', 'CLOSURE_RETURNED',
    'SAC_DECIDED', 'SAC_CREATED', 'STATUS_CHANGED'
  )),
  previous_status text,
  new_status text,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  actor_area_id uuid references public.areas(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);

create index complaints_client_idx
  on public.complaints (client_id, created_at desc);
create index complaints_attention_idx
  on public.complaints (attention_id) where attention_id is not null;
create index complaints_responsible_inbox_idx
  on public.complaints (responsible_area_id, status, created_at desc);
create index complaints_closure_inbox_idx
  on public.complaints (closure_area_id, status, created_at desc);
create index complaints_creator_idx
  on public.complaints (created_by, created_at desc);
create index complaint_action_versions_complaint_idx
  on public.complaint_action_versions (complaint_id, version_number desc);
create index complaint_response_tokens_expiry_idx
  on public.complaint_response_tokens (expires_at) where status = 'SENT';
create index complaint_closure_reviews_complaint_idx
  on public.complaint_closure_reviews (complaint_id, review_number desc);
create index complaint_communications_complaint_idx
  on public.complaint_communications (complaint_id, created_at desc);
create index complaint_events_complaint_idx
  on public.complaint_events (complaint_id, occurred_at, id);

create trigger complaint_settings_set_updated_at
before update on public.complaint_settings
for each row execute function public.set_updated_at();

create trigger complaints_set_updated_at
before update on public.complaints
for each row execute function public.set_updated_at();

create or replace function public.guard_complaint_identity_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.complaint_year is distinct from new.complaint_year
    or old.complaint_number is distinct from new.complaint_number
    or old.complaint_code is distinct from new.complaint_code
    or old.client_id is distinct from new.client_id
    or old.attention_id is distinct from new.attention_id
    or old.service_channel_id is distinct from new.service_channel_id
    or old.responsible_area_id is distinct from new.responsible_area_id
    or old.closure_area_id is distinct from new.closure_area_id
    or old.created_by is distinct from new.created_by
    or old.created_at is distinct from new.created_at then
    raise exception 'Los datos de origen de una queja no se pueden modificar.';
  end if;
  return new;
end;
$$;

create trigger complaints_guard_identity_update
before update on public.complaints
for each row execute function public.guard_complaint_identity_update();

create or replace function public.guard_area_complaint_deactivation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.is_active and not new.is_active then
    if exists (
      select 1 from public.complaint_settings cs
      where cs.singleton_id = 1 and cs.closure_area_id = old.id
    ) then
      raise exception 'No se puede inhabilitar el area configurada para el cierre de quejas.';
    end if;

    if exists (
      select 1 from public.complaints c
      where c.status not in ('CLOSED_AGREED', 'CLOSED_NO_RESPONSE')
        and (c.responsible_area_id = old.id or c.closure_area_id = old.id)
    ) then
      raise exception 'No se puede inhabilitar un area con quejas abiertas.';
    end if;
  end if;
  return new;
end;
$$;

create trigger areas_guard_complaint_deactivation
before update of is_active on public.areas
for each row execute function public.guard_area_complaint_deactivation();

create or replace function public.current_active_profile_area_id()
returns uuid
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select p.area_id
  from public.profiles p
  join public.areas a on a.id = p.area_id and a.is_active
  where p.id = auth.uid() and p.status = 'active'
  limit 1
$$;

alter function public.current_active_profile_area_id() owner to postgres;

create or replace function public.can_create_complaints()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and not public.is_active_tablet_session()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'active'
    )
    and exists (
      select 1
      from public.complaint_settings cs
      join public.areas a on a.id = cs.closure_area_id and a.is_active
      where cs.singleton_id = 1
    )
$$;

alter function public.can_create_complaints() owner to postgres;

create or replace function public.can_view_complaint(p_complaint_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and not public.is_active_tablet_session()
    and exists (
      select 1
      from public.profiles p
      join public.complaints c on c.id = p_complaint_id
      where p.id = auth.uid()
        and p.status = 'active'
        and (
          public.is_admin()
          or c.created_by = auth.uid()
          or p.area_id = c.responsible_area_id
          or (
            p.area_id = c.closure_area_id
            and c.status in (
              'PENDING_CLOSURE_REVIEW', 'PENDING_SAC_EVALUATION',
              'CLOSED_AGREED', 'CLOSED_NO_RESPONSE'
            )
          )
        )
    )
$$;

alter function public.can_view_complaint(uuid) owner to postgres;

create or replace function public.can_manage_responsible_complaint(p_complaint_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and not public.is_active_tablet_session()
    and exists (
      select 1
      from public.profiles p
      join public.areas a on a.id = p.area_id and a.is_active
      join public.complaints c
        on c.id = p_complaint_id and c.responsible_area_id = p.area_id
      where p.id = auth.uid() and p.status = 'active'
    )
$$;

alter function public.can_manage_responsible_complaint(uuid) owner to postgres;

create or replace function public.can_manage_closure_complaint(p_complaint_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and not public.is_active_tablet_session()
    and exists (
      select 1
      from public.profiles p
      join public.areas a on a.id = p.area_id and a.is_active
      join public.complaints c
        on c.id = p_complaint_id and c.closure_area_id = p.area_id
      where p.id = auth.uid()
        and p.status = 'active'
        and c.status in (
          'PENDING_CLOSURE_REVIEW', 'PENDING_SAC_EVALUATION',
          'CLOSED_AGREED', 'CLOSED_NO_RESPONSE'
        )
    )
$$;

alter function public.can_manage_closure_complaint(uuid) owner to postgres;

create or replace function public.reserve_complaint_code()
returns table (
  complaint_year integer,
  complaint_number bigint,
  complaint_code text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_year integer := extract(year from timezone('America/Lima', now()))::integer;
  v_number bigint;
begin
  insert into public.complaint_counters as counters (complaint_year, last_value)
  values (v_year, 1)
  on conflict on constraint complaint_counters_pkey do update
    set last_value = counters.last_value + 1
  returning counters.last_value into v_number;

  return query select v_year, v_number,
    'RQ-' || case when v_number < 1000 then lpad(v_number::text, 3, '0')
      else v_number::text end || '-' || v_year::text;
end;
$$;

alter function public.reserve_complaint_code() owner to postgres;

create or replace function public.reserve_sac_code()
returns table (
  sac_year integer,
  sac_number bigint,
  sac_code text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_year integer := extract(year from timezone('America/Lima', now()))::integer;
  v_number bigint;
begin
  insert into public.sac_counters as counters (sac_year, last_value)
  values (v_year, 1)
  on conflict on constraint sac_counters_pkey do update
    set last_value = counters.last_value + 1
  returning counters.last_value into v_number;

  return query select v_year, v_number,
    'SAC-' || case when v_number < 1000 then lpad(v_number::text, 3, '0')
      else v_number::text end || '-' || v_year::text;
end;
$$;

alter function public.reserve_sac_code() owner to postgres;

create or replace function public.set_complaint_closure_area(p_area_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_name text;
  v_area_name text;
  v_previous_area_id uuid;
begin
  if v_user_id is null or public.is_active_tablet_session() then
    raise exception 'No hay una sesion administrativa valida.'
      using errcode = '42501';
  end if;

  select concat_ws(' ', p.first_name, nullif(p.middle_name, ''),
    p.paternal_surname, p.maternal_surname)
  into v_actor_name
  from public.profiles p
  where p.id = v_user_id and p.status = 'active';

  if not found or not public.is_admin() then
    raise exception 'Solo un administrador activo puede configurar el area de cierre.'
      using errcode = '42501';
  end if;

  select a.name into v_area_name
  from public.areas a
  where a.id = p_area_id and a.is_active
  for update;

  if not found then
    raise exception 'Selecciona un area activa para el cierre de quejas.';
  end if;

  select cs.closure_area_id into v_previous_area_id
  from public.complaint_settings cs
  where cs.singleton_id = 1
  for update;

  if v_previous_area_id is not null
    and v_previous_area_id <> p_area_id
    and exists (
      select 1 from public.complaints c
      where c.status not in ('CLOSED_AGREED', 'CLOSED_NO_RESPONSE')
    ) then
    raise exception 'No se puede cambiar el area de cierre mientras existan quejas abiertas.';
  end if;

  insert into public.complaint_settings (
    singleton_id, closure_area_id, configured_by, configured_by_name,
    configured_at, updated_at
  ) values (
    1, p_area_id, v_user_id, v_actor_name, now(), now()
  )
  on conflict (singleton_id) do update set
    closure_area_id = excluded.closure_area_id,
    configured_by = excluded.configured_by,
    configured_by_name = excluded.configured_by_name,
    configured_at = excluded.configured_at,
    updated_at = now();

  return jsonb_build_object('area_id', p_area_id, 'area_name', v_area_name);
end;
$$;

alter function public.set_complaint_closure_area(uuid) owner to postgres;

create or replace function public.get_complaint_closure_area()
returns table (
  area_id uuid,
  area_name text,
  group_email text,
  is_active boolean
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or public.is_active_tablet_session() or not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active'
  ) then
    raise exception 'No tienes permiso para consultar la configuracion de quejas.'
      using errcode = '42501';
  end if;

  return query
  select a.id, a.name, a.group_email, a.is_active
  from public.complaint_settings cs
  join public.areas a on a.id = cs.closure_area_id
  where cs.singleton_id = 1;
end;
$$;

alter function public.get_complaint_closure_area() owner to postgres;

create or replace function public.set_area_active(
  p_area_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_name text;
begin
  select concat_ws(' ', p.first_name, nullif(p.middle_name, ''),
    p.paternal_surname, p.maternal_surname)
  into v_actor_name
  from public.profiles p
  where p.id = v_user_id and p.status = 'active';

  if v_actor_name is null
    or public.is_active_tablet_session()
    or not public.is_admin() then
    raise exception 'Solo un administrador activo puede cambiar el estado de un area.'
      using errcode = '42501';
  end if;

  if not p_is_active and exists (
    select 1 from public.complaint_settings cs
    where cs.singleton_id = 1 and cs.closure_area_id = p_area_id
  ) then
    raise exception 'No se puede inhabilitar el area configurada para el cierre de quejas.';
  end if;

  if not p_is_active and exists (
    select 1 from public.complaints c
    where c.status not in ('CLOSED_AGREED', 'CLOSED_NO_RESPONSE')
      and (c.responsible_area_id = p_area_id or c.closure_area_id = p_area_id)
  ) then
    raise exception 'No se puede inhabilitar un area con quejas abiertas.';
  end if;

  update public.areas a
  set is_active = p_is_active,
      disabled_by = case when p_is_active then null else v_user_id end,
      disabled_by_name = case when p_is_active then null else v_actor_name end,
      disabled_at = case when p_is_active then null else now() end
  where a.id = p_area_id;

  if not found then
    raise exception 'El area indicada no existe.';
  end if;
end;
$$;

alter function public.set_area_active(uuid, boolean) owner to postgres;

alter table public.complaint_settings enable row level security;
alter table public.complaint_counters enable row level security;
alter table public.sac_counters enable row level security;
alter table public.complaints enable row level security;
alter table public.complaint_action_versions enable row level security;
alter table public.complaint_response_tokens enable row level security;
alter table public.complaint_closure_reviews enable row level security;
alter table public.complaint_sac_decisions enable row level security;
alter table public.corrective_action_requests enable row level security;
alter table public.complaint_communications enable row level security;
alter table public.complaint_events enable row level security;

revoke all on public.complaint_settings from public, anon, authenticated;
revoke all on public.complaint_counters from public, anon, authenticated;
revoke all on public.sac_counters from public, anon, authenticated;
revoke all on public.complaints from public, anon, authenticated;
revoke all on public.complaint_action_versions from public, anon, authenticated;
revoke all on public.complaint_response_tokens from public, anon, authenticated;
revoke all on public.complaint_closure_reviews from public, anon, authenticated;
revoke all on public.complaint_sac_decisions from public, anon, authenticated;
revoke all on public.corrective_action_requests from public, anon, authenticated;
revoke all on public.complaint_communications from public, anon, authenticated;
revoke all on public.complaint_events from public, anon, authenticated;
revoke all on sequence public.complaint_events_id_seq
  from public, anon, authenticated;

grant select on public.complaint_settings to authenticated;
grant select on public.complaints to authenticated;
grant select on public.complaint_action_versions to authenticated;
grant select on public.complaint_response_tokens to authenticated;
grant select on public.complaint_closure_reviews to authenticated;
grant select on public.complaint_sac_decisions to authenticated;
grant select on public.corrective_action_requests to authenticated;
grant select on public.complaint_communications to authenticated;
grant select on public.complaint_events to authenticated;

grant all on public.complaint_settings to service_role;
grant all on public.complaint_counters to service_role;
grant all on public.sac_counters to service_role;
grant all on public.complaints to service_role;
grant all on public.complaint_action_versions to service_role;
grant all on public.complaint_response_tokens to service_role;
grant all on public.complaint_closure_reviews to service_role;
grant all on public.complaint_sac_decisions to service_role;
grant all on public.corrective_action_requests to service_role;
grant all on public.complaint_communications to service_role;
grant all on public.complaint_events to service_role;
grant usage, select on sequence public.complaint_events_id_seq to service_role;

create policy complaint_settings_select_active_users
on public.complaint_settings for select to authenticated
using (
  not public.is_active_tablet_session()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active'
  )
);

create policy complaints_select_authorized
on public.complaints for select to authenticated
using (public.can_view_complaint(id));

create policy complaint_action_versions_select_authorized
on public.complaint_action_versions for select to authenticated
using (public.can_view_complaint(complaint_id));

create policy complaint_response_tokens_select_authorized
on public.complaint_response_tokens for select to authenticated
using (public.can_view_complaint(complaint_id));

create policy complaint_closure_reviews_select_authorized
on public.complaint_closure_reviews for select to authenticated
using (public.can_view_complaint(complaint_id));

create policy complaint_sac_decisions_select_authorized
on public.complaint_sac_decisions for select to authenticated
using (public.can_view_complaint(complaint_id));

create policy corrective_action_requests_select_authorized
on public.corrective_action_requests for select to authenticated
using (public.can_view_complaint(complaint_id));

create policy complaint_communications_select_authorized
on public.complaint_communications for select to authenticated
using (public.can_view_complaint(complaint_id));

create policy complaint_events_select_authorized
on public.complaint_events for select to authenticated
using (public.can_view_complaint(complaint_id));

revoke execute on function public.current_active_profile_area_id()
  from public, anon;
revoke execute on function public.can_create_complaints()
  from public, anon;
revoke execute on function public.can_view_complaint(uuid)
  from public, anon;
revoke execute on function public.can_manage_responsible_complaint(uuid)
  from public, anon;
revoke execute on function public.can_manage_closure_complaint(uuid)
  from public, anon;
revoke execute on function public.reserve_complaint_code()
  from public, anon, authenticated;
revoke execute on function public.reserve_sac_code()
  from public, anon, authenticated;
revoke execute on function public.set_complaint_closure_area(uuid)
  from public, anon;
revoke execute on function public.get_complaint_closure_area()
  from public, anon;
revoke execute on function public.set_area_active(uuid, boolean)
  from public, anon;

grant execute on function public.current_active_profile_area_id()
  to authenticated;
grant execute on function public.can_create_complaints()
  to authenticated;
grant execute on function public.can_view_complaint(uuid)
  to authenticated;
grant execute on function public.can_manage_responsible_complaint(uuid)
  to authenticated;
grant execute on function public.can_manage_closure_complaint(uuid)
  to authenticated;
grant execute on function public.set_complaint_closure_area(uuid)
  to authenticated;
grant execute on function public.get_complaint_closure_area()
  to authenticated;
grant execute on function public.set_area_active(uuid, boolean)
  to authenticated;

grant execute on function public.reserve_complaint_code()
  to service_role;
grant execute on function public.reserve_sac_code()
  to service_role;

commit;
