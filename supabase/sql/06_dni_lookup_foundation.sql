-- Etapa 2: limites persistentes y auditoria segura para la consulta externa de DNI.
-- Ejecutar despues de 05_email_delivery_foundation.sql.

begin;

create table public.dni_lookup_rate_limits (
  scope_type text not null check (scope_type in ('USER', 'ORIGIN')),
  scope_key text not null check (length(scope_key) between 8 and 128),
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (scope_type, scope_key, window_started_at)
);

create index dni_lookup_rate_limits_window_idx
  on public.dni_lookup_rate_limits (window_started_at);

create table public.dni_lookup_attempts (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  origin_hash text not null check (origin_hash ~ '^[0-9a-f]{64}$'),
  document_hash text not null check (document_hash ~ '^[0-9a-f]{64}$'),
  outcome text not null check (outcome in (
    'FOUND', 'NOT_FOUND', 'RATE_LIMITED', 'PROVIDER_ERROR', 'INVALID_RESPONSE'
  )),
  provider_status integer check (provider_status is null or provider_status between 100 and 599),
  duration_ms integer not null check (duration_ms >= 0),
  created_at timestamptz not null default now()
);

create index dni_lookup_attempts_created_at_idx
  on public.dni_lookup_attempts (created_at desc);
create index dni_lookup_attempts_user_idx
  on public.dni_lookup_attempts (user_id, created_at desc);

create or replace function public.consume_dni_lookup_rate_limit(
  p_user_id uuid,
  p_origin_hash text
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  user_request_count integer,
  origin_request_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window timestamptz := date_trunc('minute', clock_timestamp());
  v_user_count integer;
  v_origin_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Esta operacion solo puede ejecutarse desde el servicio de consulta DNI.';
  end if;
  if p_user_id is null or p_origin_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Los datos del limite de solicitudes no son validos.';
  end if;

  delete from public.dni_lookup_rate_limits
  where window_started_at < v_window - interval '1 day';

  insert into public.dni_lookup_rate_limits as limits (
    scope_type, scope_key, window_started_at, request_count
  ) values ('USER', p_user_id::text, v_window, 1)
  on conflict (scope_type, scope_key, window_started_at) do update
    set request_count = limits.request_count + 1,
        updated_at = now()
  returning request_count into v_user_count;

  insert into public.dni_lookup_rate_limits as limits (
    scope_type, scope_key, window_started_at, request_count
  ) values ('ORIGIN', p_origin_hash, v_window, 1)
  on conflict (scope_type, scope_key, window_started_at) do update
    set request_count = limits.request_count + 1,
        updated_at = now()
  returning request_count into v_origin_count;

  return query select
    v_user_count <= 10 and v_origin_count <= 30,
    greatest(1, ceil(extract(epoch from (v_window + interval '1 minute' - clock_timestamp())))::integer),
    v_user_count,
    v_origin_count;
end;
$$;

alter table public.dni_lookup_rate_limits enable row level security;
alter table public.dni_lookup_attempts enable row level security;

revoke all on public.dni_lookup_rate_limits from public, anon, authenticated;
revoke all on public.dni_lookup_attempts from public, anon, authenticated;
revoke all on sequence public.dni_lookup_attempts_id_seq from public, anon, authenticated;
revoke execute on function public.consume_dni_lookup_rate_limit(uuid, text)
  from public, anon, authenticated;

grant select, insert, update, delete on public.dni_lookup_rate_limits to service_role;
grant select, insert on public.dni_lookup_attempts to service_role;
grant usage, select on sequence public.dni_lookup_attempts_id_seq to service_role;
grant execute on function public.consume_dni_lookup_rate_limit(uuid, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
