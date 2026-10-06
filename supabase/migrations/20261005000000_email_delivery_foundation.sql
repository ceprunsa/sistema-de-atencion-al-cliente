-- Etapa 1: infraestructura persistente para el servicio de correo.
-- Ejecutar despues de 04_workstations_surveys_referral_inbox.sql.

begin;

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'REFERRAL_CREATED',
    'ATTENTION_SURVEY',
    'REFERRAL_RESOLVED'
  )),
  aggregate_type text not null check (aggregate_type in ('ATTENTION', 'REFERRAL')),
  aggregate_id uuid not null,
  recipient_email text not null check (nullif(btrim(recipient_email), '') is not null),
  cc_emails text[] not null default array[]::text[],
  template_key text not null check (template_key in (
    'REFERRAL_CREATED',
    'ATTENTION_SURVEY',
    'REFERRAL_RESOLVED'
  )),
  check (event_type = template_key),
  check (
    (event_type = 'ATTENTION_SURVEY' and aggregate_type = 'ATTENTION')
    or (event_type in ('REFERRAL_CREATED', 'REFERRAL_RESOLVED')
      and aggregate_type = 'REFERRAL')
  ),
  template_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(template_data) = 'object'),
  encrypted_payload text,
  idempotency_key text not null unique
    check (length(btrim(idempotency_key)) between 8 and 250),
  status text not null default 'PENDING' check (status in (
    'PENDING', 'PROCESSING', 'RETRY', 'SENT', 'FAILED_PERMANENT'
  )),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by uuid,
  accepted_at timestamptz,
  provider_message_id text,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'PROCESSING' and locked_at is not null and locked_by is not null)
    or (status <> 'PROCESSING' and locked_at is null and locked_by is null)
  ),
  check (
    (status = 'SENT' and accepted_at is not null)
    or (status <> 'SENT' and accepted_at is null)
  ),
  check (
    status <> 'FAILED_PERMANENT'
    or (nullif(btrim(last_error_code), '') is not null
      and nullif(btrim(last_error_message), '') is not null)
  )
);

create table public.email_delivery_attempts (
  id bigint generated always as identity primary key,
  outbox_id uuid not null references public.email_outbox(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  outcome text not null check (outcome in (
    'SENT', 'FAILED_RETRYABLE', 'FAILED_PERMANENT'
  )),
  provider_response_code text,
  error_code text,
  error_message text,
  attempted_at timestamptz not null default now(),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  unique (outbox_id, attempt_number)
);

create index email_outbox_dispatch_idx
  on public.email_outbox (next_attempt_at, created_at)
  where status in ('PENDING', 'RETRY');
create index email_outbox_processing_idx
  on public.email_outbox (locked_at)
  where status = 'PROCESSING';
create index email_outbox_aggregate_idx
  on public.email_outbox (aggregate_type, aggregate_id, event_type);
create index email_delivery_attempts_outbox_idx
  on public.email_delivery_attempts (outbox_id, attempted_at desc);

create trigger email_outbox_set_updated_at
before update on public.email_outbox
for each row execute function public.set_updated_at();

create or replace function public.claim_email_outbox_batch(
  p_worker_id uuid,
  p_limit integer default 20
)
returns table (
  id uuid,
  event_type text,
  aggregate_type text,
  aggregate_id uuid,
  recipient_email text,
  cc_emails text[],
  template_key text,
  template_data jsonb,
  encrypted_payload text,
  idempotency_key text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Esta operacion solo puede ejecutarse desde el servicio de correo.';
  end if;

  if p_worker_id is null then
    raise exception 'El identificador del worker es obligatorio.';
  end if;

  return query
  with candidates as (
    select eo.id
    from public.email_outbox eo
    where eo.attempt_count < 5
      and (
        (eo.status in ('PENDING', 'RETRY') and eo.next_attempt_at <= now())
        or (eo.status = 'PROCESSING' and eo.locked_at < now() - interval '10 minutes')
      )
    order by eo.next_attempt_at, eo.created_at
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    for update skip locked
  ), claimed as (
    update public.email_outbox eo
    set status = 'PROCESSING',
        attempt_count = eo.attempt_count + 1,
        locked_at = now(),
        locked_by = p_worker_id
    from candidates c
    where eo.id = c.id
    returning eo.*
  )
  select c.id, c.event_type, c.aggregate_type, c.aggregate_id,
    c.recipient_email, c.cc_emails, c.template_key, c.template_data,
    c.encrypted_payload, c.idempotency_key, c.attempt_count
  from claimed c
  order by c.created_at;
end;
$$;

create or replace function public.finish_email_outbox_attempt(
  p_outbox_id uuid,
  p_worker_id uuid,
  p_outcome text,
  p_provider_response_code text default null,
  p_error_code text default null,
  p_error_message text default null,
  p_accepted_at timestamptz default null,
  p_provider_message_id text default null,
  p_next_attempt_at timestamptz default null,
  p_duration_ms integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt integer;
  v_status text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Esta operacion solo puede ejecutarse desde el servicio de correo.';
  end if;

  if p_outcome not in ('SENT', 'FAILED_RETRYABLE', 'FAILED_PERMANENT') then
    raise exception 'El resultado del intento no es valido.';
  end if;

  select eo.attempt_count into v_attempt
  from public.email_outbox eo
  where eo.id = p_outbox_id
    and eo.status = 'PROCESSING'
    and eo.locked_by = p_worker_id
  for update;

  if not found then
    raise exception 'La entrega no pertenece al worker o ya fue finalizada.';
  end if;

  v_status := case
    when p_outcome = 'SENT' then 'SENT'
    when p_outcome = 'FAILED_RETRYABLE' and v_attempt < 5 then 'RETRY'
    else 'FAILED_PERMANENT'
  end;

  if v_status = 'FAILED_PERMANENT'
    and (nullif(btrim(p_error_code), '') is null
      or nullif(btrim(p_error_message), '') is null) then
    raise exception 'Un fallo permanente debe incluir codigo y mensaje.';
  end if;

  update public.email_outbox
  set status = v_status,
      next_attempt_at = case
        when v_status = 'RETRY' then coalesce(p_next_attempt_at, now() + interval '5 minutes')
        else next_attempt_at
      end,
      locked_at = null,
      locked_by = null,
      accepted_at = case when v_status = 'SENT' then coalesce(p_accepted_at, now()) else null end,
      provider_message_id = case when v_status = 'SENT' then nullif(btrim(p_provider_message_id), '') else null end,
      last_error_code = case when v_status = 'SENT' then null else nullif(btrim(p_error_code), '') end,
      last_error_message = case when v_status = 'SENT' then null else left(nullif(btrim(p_error_message), ''), 1000) end
  where id = p_outbox_id;

  insert into public.email_delivery_attempts (
    outbox_id, attempt_number, outcome, provider_response_code,
    error_code, error_message, duration_ms
  ) values (
    p_outbox_id,
    v_attempt,
    case when v_status = 'RETRY' then 'FAILED_RETRYABLE' else v_status end,
    nullif(btrim(p_provider_response_code), ''),
    nullif(btrim(p_error_code), ''),
    left(nullif(btrim(p_error_message), ''), 1000),
    p_duration_ms
  );
end;
$$;

alter table public.email_outbox enable row level security;
alter table public.email_delivery_attempts enable row level security;

revoke all on public.email_outbox from public, anon, authenticated;
revoke all on public.email_delivery_attempts from public, anon, authenticated;
revoke all on sequence public.email_delivery_attempts_id_seq from public, anon, authenticated;
revoke execute on function public.claim_email_outbox_batch(uuid, integer)
  from public, anon, authenticated;
revoke execute on function public.finish_email_outbox_attempt(
  uuid, uuid, text, text, text, text, timestamptz, text, timestamptz, integer
) from public, anon, authenticated;

grant select, insert, update on public.email_outbox to service_role;
grant select, insert on public.email_delivery_attempts to service_role;
grant usage, select on sequence public.email_delivery_attempts_id_seq to service_role;
grant execute on function public.claim_email_outbox_batch(uuid, integer)
  to service_role;
grant execute on function public.finish_email_outbox_attempt(
  uuid, uuid, text, text, text, text, timestamptz, text, timestamptz, integer
) to service_role;

notify pgrst, 'reload schema';

commit;
