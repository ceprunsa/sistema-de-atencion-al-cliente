-- Exportaciones asincronas de atenciones a Excel.
-- Ejecutar despues de 27_attention_listing_filters.sql.

begin;

create table public.attention_export_jobs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id) on delete cascade,
  requested_by_name text not null check (btrim(requested_by_name) <> ''),
  is_admin boolean not null,
  export_mode text not null check (export_mode in ('ALL', 'FILTERED', 'DATE_RANGE')),
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'QUEUED'
    check (status in ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED')),
  snapshot_at timestamptz not null default now(),
  total_rows bigint not null default 0 check (total_rows >= 0),
  progress_rows bigint not null default 0 check (progress_rows >= 0),
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  file_name text not null check (btrim(file_name) <> ''),
  storage_path text,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index attention_export_jobs_active_hash_uidx
  on public.attention_export_jobs (requested_by, request_hash)
  where status in ('QUEUED', 'PROCESSING');
create index attention_export_jobs_user_created_idx
  on public.attention_export_jobs (requested_by, created_at desc);
create index attention_export_jobs_expiry_idx
  on public.attention_export_jobs (expires_at)
  where status = 'COMPLETED';

create trigger attention_export_jobs_set_updated_at
before update on public.attention_export_jobs
for each row execute function public.set_updated_at();

alter table public.attention_export_jobs enable row level security;
grant select on public.attention_export_jobs to authenticated;
create policy "attention_export_jobs_select_own"
on public.attention_export_jobs for select to authenticated
using (requested_by = auth.uid() and not public.is_active_tablet_session());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attention-exports', 'attention-exports', false, 52428800,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.request_attention_export(
  p_mode text default 'ALL', p_search text default '',
  p_survey_status text default null, p_referral_status text default null,
  p_area_id uuid default null, p_admission_process_id uuid default null,
  p_service_channel_id uuid default null, p_workstation_id uuid default null,
  p_start_date date default null, p_end_date date default null
)
returns table (
  job_id uuid, job_status text, total_rows bigint, file_name text,
  expires_at timestamptz, reused boolean
)
language plpgsql security definer set search_path = public, storage, extensions, pg_temp
as $request_export$
declare
  v_user_id uuid := auth.uid();
  v_name text;
  v_is_admin boolean := public.is_admin();
  v_mode text := upper(btrim(coalesce(p_mode, 'ALL')));
  v_filters jsonb;
  v_hash text;
  v_total bigint;
  v_job public.attention_export_jobs%rowtype;
  v_start_at timestamptz;
  v_end_at timestamptz;
begin
  if v_user_id is null or public.is_active_tablet_session() then
    raise exception 'No tienes permiso para exportar atenciones.' using errcode = '42501';
  end if;
  select concat_ws(' ', p.first_name, p.middle_name, p.paternal_surname, p.maternal_surname)
    into v_name from public.profiles p where p.id = v_user_id and p.status = 'active';
  if nullif(btrim(v_name), '') is null then
    raise exception 'Tu usuario no esta activo.' using errcode = '42501';
  end if;
  if v_mode not in ('ALL', 'FILTERED', 'DATE_RANGE') then
    raise exception 'Modalidad de exportacion no valida.' using errcode = '22023';
  end if;
  if v_mode = 'ALL' then
    p_search := ''; p_survey_status := null; p_referral_status := null;
    p_area_id := null; p_admission_process_id := null;
    p_service_channel_id := null; p_workstation_id := null;
    p_start_date := null; p_end_date := null;
  elsif v_mode = 'FILTERED' then
    p_start_date := null; p_end_date := null;
  else
    if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
      raise exception 'El rango de fechas no es valido.' using errcode = '22023';
    end if;
    if p_end_date - p_start_date > 3660 then
      raise exception 'El rango no puede superar diez anios.' using errcode = '22023';
    end if;
    v_start_at := p_start_date::timestamp at time zone 'America/Lima';
    v_end_at := (p_end_date + 1)::timestamp at time zone 'America/Lima';
  end if;

  v_filters := jsonb_build_object(
    'search', btrim(coalesce(p_search, '')),
    'surveyStatus', p_survey_status, 'referralStatus', p_referral_status,
    'areaId', p_area_id, 'admissionProcessId', p_admission_process_id,
    'serviceChannelId', p_service_channel_id, 'workstationId', p_workstation_id,
    'startAt', v_start_at, 'endAtExclusive', v_end_at
  );
  v_hash := encode(digest(v_user_id::text || '|' || v_mode || '|' || v_filters::text, 'sha256'), 'hex');

  select job.* into v_job
  from public.attention_export_jobs job
  where job.requested_by = v_user_id and job.request_hash = v_hash
    and (job.status in ('QUEUED', 'PROCESSING')
      or (job.status = 'COMPLETED' and job.expires_at > now() and job.completed_at > now() - interval '10 minutes'))
  order by job.created_at desc limit 1;
  if v_job.id is not null then
    return query select v_job.id, v_job.status, v_job.total_rows, v_job.file_name, v_job.expires_at, true;
    return;
  end if;

  select count(*) into v_total
  from public.customer_attentions ca
  join public.clients client on client.id = ca.client_id
  left join public.attention_surveys survey on survey.attention_id = ca.id
  left join public.attention_referrals referral on referral.attention_id = ca.id
  where (case when v_is_admin then true else ca.status = 'ACTIVE' and ca.created_by = v_user_id end)
    and ca.created_at <= now()
    and (v_start_at is null or ca.created_at >= v_start_at)
    and (v_end_at is null or ca.created_at < v_end_at)
    and (p_service_channel_id is null or ca.service_channel_id = p_service_channel_id)
    and (p_workstation_id is null or survey.workstation_id = p_workstation_id)
    and (p_survey_status is null or coalesce(survey.status, 'NONE') = p_survey_status)
    and (p_referral_status is null or coalesce(referral.status, 'NONE') = p_referral_status)
    and (p_area_id is null or referral.destination_area_id = p_area_id)
    and (p_admission_process_id is null or exists (
      select 1 from public.attention_admission_processes aap
      where aap.attention_id = ca.id and aap.admission_process_id = p_admission_process_id
    ))
    and (btrim(coalesce(p_search, '')) = ''
      or ca.rac_code ilike '%' || btrim(p_search) || '%'
      or client.display_name ilike '%' || btrim(p_search) || '%'
      or client.email ilike '%' || btrim(p_search) || '%'
      or (regexp_replace(p_search, '[^0-9]', '', 'g') <> ''
        and client.dni ilike '%' || regexp_replace(p_search, '[^0-9]', '', 'g') || '%'));

  insert into public.attention_export_jobs (
    requested_by, requested_by_name, is_admin, export_mode, filters,
    request_hash, snapshot_at, total_rows, file_name
  ) values (
    v_user_id, v_name, v_is_admin, v_mode, v_filters, v_hash, now(), v_total,
    'atenciones-' || to_char(clock_timestamp() at time zone 'America/Lima', 'YYYYMMDD-HH24MISS') || '.xlsx'
  ) returning * into v_job;

  return query select v_job.id, v_job.status, v_job.total_rows, v_job.file_name, v_job.expires_at, false;
end;
$request_export$;

create or replace function public.retry_attention_export(p_job_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $retry_export$
begin
  update public.attention_export_jobs job
  set status = 'QUEUED', error_code = null, error_message = null,
      started_at = null, completed_at = null, progress_rows = 0
  where job.id = p_job_id and job.requested_by = auth.uid()
    and job.status = 'FAILED' and job.attempt_count < 3;
  if not found then raise exception 'La exportacion no puede reintentarse.' using errcode = '42501'; end if;
end;
$retry_export$;

create or replace function public.claim_attention_export_job(p_job_id uuid)
returns setof public.attention_export_jobs
language plpgsql security definer set search_path = public, pg_temp
as $claim_export$
begin
  if auth.role() <> 'service_role' then raise exception 'Acceso denegado.' using errcode = '42501'; end if;
  return query
  update public.attention_export_jobs job
  set status = 'PROCESSING', started_at = now(), attempt_count = job.attempt_count + 1,
      error_code = null, error_message = null
  where job.id = p_job_id and job.status = 'QUEUED' and job.attempt_count < 3
  returning job.*;
end;
$claim_export$;

create or replace function public.get_attention_export_batch(
  p_job_id uuid, p_after_created_at timestamptz default null,
  p_after_id uuid default null, p_limit integer default 500
)
returns table (
  attention_id uuid, rac_code text, created_at timestamptz, attention_status text,
  client_name text, client_dni text, client_email text, client_phone text,
  service_channel text, workstation text, created_by_name text, requester_type text,
  admission_processes text, consultation_types text, consultation_topics text,
  conclusion text, survey_status text, referral_area text, referral_status text,
  referral_conclusion text
)
language plpgsql security definer stable set search_path = public, pg_temp
as $export_batch$
declare v_job public.attention_export_jobs%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Acceso denegado.' using errcode = '42501'; end if;
  select job.* into v_job from public.attention_export_jobs job
  where job.id = p_job_id and job.status = 'PROCESSING';
  if v_job.id is null then raise exception 'Trabajo de exportacion no disponible.'; end if;

  return query
  select ca.id, ca.rac_code, ca.created_at, ca.status, client.display_name, client.dni,
    client.email, client.phone, channel.name, station.name, ca.created_by_name,
    ca.requester_type, processes.names, topics.type_names, topics.topic_names,
    ca.conclusion, coalesce(survey.status, 'NONE'), referral.destination_area_name,
    coalesce(referral.status, 'NONE'), referral.conclusion
  from public.customer_attentions ca
  join public.clients client on client.id = ca.client_id
  join public.service_channels channel on channel.id = ca.service_channel_id
  left join public.attention_surveys survey on survey.attention_id = ca.id
  left join public.workstations station on station.id = survey.workstation_id
  left join public.attention_referrals referral on referral.attention_id = ca.id
  left join lateral (
    select string_agg(distinct ct.name, '; ' order by ct.name) type_names,
      string_agg(ct.name || ': ' || topic.name, '; ' order by ct.name, topic.name) topic_names
    from public.attention_topics atopic
    join public.consultation_topics topic on topic.id = atopic.topic_id
    join public.consultation_types ct on ct.id = topic.consultation_type_id
    where atopic.attention_id = ca.id
  ) topics on true
  left join lateral (
    select string_agg(
      case when ap.phase = 'CUSTOM' then ap.custom_label || ' ' || ap.year
        else replace(ap.phase, '_', ' ') || ' ' || ap.year end,
      '; ' order by ap.year, ap.phase
    ) names
    from public.attention_admission_processes aap
    join public.admission_processes ap on ap.id = aap.admission_process_id
    where aap.attention_id = ca.id
  ) processes on true
  where (case when v_job.is_admin then true else ca.status = 'ACTIVE' and ca.created_by = v_job.requested_by end)
    and ca.created_at <= v_job.snapshot_at
    and ((v_job.filters->>'startAt') is null or ca.created_at >= (v_job.filters->>'startAt')::timestamptz)
    and ((v_job.filters->>'endAtExclusive') is null or ca.created_at < (v_job.filters->>'endAtExclusive')::timestamptz)
    and ((v_job.filters->>'serviceChannelId') is null or ca.service_channel_id = (v_job.filters->>'serviceChannelId')::uuid)
    and ((v_job.filters->>'workstationId') is null or survey.workstation_id = (v_job.filters->>'workstationId')::uuid)
    and ((v_job.filters->>'surveyStatus') is null or coalesce(survey.status, 'NONE') = v_job.filters->>'surveyStatus')
    and ((v_job.filters->>'referralStatus') is null or coalesce(referral.status, 'NONE') = v_job.filters->>'referralStatus')
    and ((v_job.filters->>'areaId') is null or referral.destination_area_id = (v_job.filters->>'areaId')::uuid)
    and ((v_job.filters->>'admissionProcessId') is null or exists (
      select 1 from public.attention_admission_processes filter_aap
      where filter_aap.attention_id = ca.id
        and filter_aap.admission_process_id = (v_job.filters->>'admissionProcessId')::uuid
    ))
    and (coalesce(v_job.filters->>'search', '') = ''
      or ca.rac_code ilike '%' || (v_job.filters->>'search') || '%'
      or client.display_name ilike '%' || (v_job.filters->>'search') || '%'
      or client.email ilike '%' || (v_job.filters->>'search') || '%'
      or (regexp_replace(v_job.filters->>'search', '[^0-9]', '', 'g') <> ''
        and client.dni ilike '%' || regexp_replace(v_job.filters->>'search', '[^0-9]', '', 'g') || '%'))
    and (p_after_created_at is null or (ca.created_at, ca.id) < (p_after_created_at, p_after_id))
  order by ca.created_at desc, ca.id desc
  limit greatest(1, least(coalesce(p_limit, 500), 1000));
end;
$export_batch$;

revoke all on function public.request_attention_export(text,text,text,text,uuid,uuid,uuid,uuid,date,date) from public, anon;
grant execute on function public.request_attention_export(text,text,text,text,uuid,uuid,uuid,uuid,date,date) to authenticated;
revoke all on function public.retry_attention_export(uuid) from public, anon;
grant execute on function public.retry_attention_export(uuid) to authenticated;
revoke all on function public.claim_attention_export_job(uuid) from public, anon, authenticated;
grant execute on function public.claim_attention_export_job(uuid) to service_role;
revoke all on function public.get_attention_export_batch(uuid,timestamptz,uuid,integer) from public, anon, authenticated;
grant execute on function public.get_attention_export_batch(uuid,timestamptz,uuid,integer) to service_role;

notify pgrst, 'reload schema';
commit;
