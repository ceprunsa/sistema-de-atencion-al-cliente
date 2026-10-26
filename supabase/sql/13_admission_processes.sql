-- Etapa 4: procesos de admision opcionales por atencion.
begin;

create table if not exists public.admission_processes (
  id uuid primary key default gen_random_uuid(),
  phase text not null check (phase in (
    'CEPRUNSA_I', 'CEPRUNSA_QUINTOS', 'CEPRUNSA_II', 'EXTRAORDINARIO', 'CUSTOM'
  )),
  custom_label text,
  year integer not null check (year between 2000 and 2100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (phase = 'CUSTOM' and length(btrim(custom_label)) between 1 and 120)
    or (phase <> 'CUSTOM' and custom_label is null)
  )
);

create unique index if not exists admission_processes_standard_uidx
  on public.admission_processes (phase, year)
  where phase <> 'CUSTOM';
create unique index if not exists admission_processes_custom_uidx
  on public.admission_processes (lower(btrim(custom_label)), year)
  where phase = 'CUSTOM';

drop trigger if exists admission_processes_set_updated_at
on public.admission_processes;
create trigger admission_processes_set_updated_at
before update on public.admission_processes
for each row execute function public.set_updated_at();

create table if not exists public.attention_admission_processes (
  attention_id uuid not null references public.customer_attentions(id) on delete cascade,
  admission_process_id uuid not null references public.admission_processes(id) on delete restrict,
  primary key (attention_id, admission_process_id)
);

create index if not exists attention_admission_processes_process_idx
  on public.attention_admission_processes (admission_process_id, attention_id);

create or replace function public.prevent_used_admission_process_identity_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (
    new.phase is distinct from old.phase
    or new.custom_label is distinct from old.custom_label
    or new.year is distinct from old.year
  ) and exists (
    select 1 from public.attention_admission_processes aap
    where aap.admission_process_id = old.id
  ) then
    raise exception 'No se puede cambiar la fase o el año de un proceso que ya tiene atenciones.';
  end if;
  return new;
end;
$$;

drop trigger if exists admission_processes_preserve_used_identity
on public.admission_processes;
create trigger admission_processes_preserve_used_identity
before update of phase, custom_label, year on public.admission_processes
for each row execute function public.prevent_used_admission_process_identity_change();

create or replace function public.create_customer_attention_v3(
  p_client jsonb,
  p_service_channel_id uuid,
  p_requester_type text,
  p_conclusion text,
  p_topics jsonb,
  p_client_contact_email text,
  p_admission_process_ids jsonb,
  p_kinship_type_id uuid default null,
  p_destination_area_id uuid default null,
  p_requester_detail text default null,
  p_kinship_detail text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_attention_id uuid;
  v_item jsonb;
  v_process_id uuid;
begin
  if p_admission_process_ids is null or jsonb_typeof(p_admission_process_ids) <> 'array' then
    raise exception 'Los procesos de admision deben enviarse como una lista.';
  end if;

  select public.create_customer_attention_v2(
    p_client, p_service_channel_id, p_requester_type, p_conclusion, p_topics,
    p_client_contact_email, p_kinship_type_id, p_destination_area_id,
    p_requester_detail, p_kinship_detail
  ) into v_result;

  v_attention_id := (v_result ->> 'id')::uuid;
  for v_item in select value from jsonb_array_elements(p_admission_process_ids)
  loop
    begin
      v_process_id := trim(both '"' from v_item::text)::uuid;
    exception when invalid_text_representation then
      raise exception 'Uno de los procesos de admision no es valido.';
    end;
    if not exists (
      select 1 from public.admission_processes ap
      where ap.id = v_process_id and ap.is_active
    ) then
      raise exception 'Uno de los procesos de admision no esta activo.';
    end if;
    insert into public.attention_admission_processes (attention_id, admission_process_id)
    values (v_attention_id, v_process_id)
    on conflict do nothing;
  end loop;
  return v_result;
end;
$$;

create or replace function public.update_customer_attention_v3(
  p_attention_id uuid,
  p_client jsonb,
  p_service_channel_id uuid,
  p_requester_type text,
  p_conclusion text,
  p_topics jsonb,
  p_admission_process_ids jsonb,
  p_kinship_type_id uuid default null,
  p_destination_area_id uuid default null,
  p_requester_detail text default null,
  p_kinship_detail text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_process_id uuid;
  v_process_ids uuid[] := array[]::uuid[];
begin
  if p_admission_process_ids is null or jsonb_typeof(p_admission_process_ids) <> 'array' then
    raise exception 'Los procesos de admision deben enviarse como una lista.';
  end if;

  for v_item in select value from jsonb_array_elements(p_admission_process_ids)
  loop
    begin
      v_process_id := trim(both '"' from v_item::text)::uuid;
    exception when invalid_text_representation then
      raise exception 'Uno de los procesos de admision no es valido.';
    end;
    if not exists (
      select 1 from public.admission_processes ap
      where ap.id = v_process_id
        and (
          ap.is_active
          or exists (
            select 1 from public.attention_admission_processes aap
            where aap.attention_id = p_attention_id
              and aap.admission_process_id = ap.id
          )
        )
    ) then
      raise exception 'Uno de los procesos de admision no esta disponible.';
    end if;
    v_process_ids := array_append(v_process_ids, v_process_id);
  end loop;

  perform public.update_customer_attention_v2(
    p_attention_id, p_client, p_service_channel_id, p_requester_type,
    p_conclusion, p_topics, p_kinship_type_id, p_destination_area_id,
    p_requester_detail, p_kinship_detail
  );

  delete from public.attention_admission_processes
  where attention_id = p_attention_id;

  insert into public.attention_admission_processes (attention_id, admission_process_id)
  select p_attention_id, process_id
  from unnest(v_process_ids) as process_id
  on conflict do nothing;
end;
$$;

create or replace function public.list_customer_attentions_v3(
  p_page integer default 1,
  p_limit integer default 10,
  p_search text default '',
  p_survey_status text default null,
  p_referral_status text default null,
  p_area_id uuid default null,
  p_admission_process_id uuid default null
)
returns table (
  id uuid, rac_code text, attention_status text, requester_type text,
  client_dni text, client_name text, service_channel_name text,
  created_by_name text, created_at timestamptz, survey_status text,
  referral_status text, referral_area_id uuid, referral_area_name text,
  total_count bigint
)
language plpgsql security definer stable set search_path = public, pg_temp
as $$
declare v_is_admin boolean := public.is_admin();
begin
  if auth.uid() is null or public.is_active_tablet_session() then
    raise exception 'No tienes permiso para consultar atenciones.';
  end if;
  return query
  select ca.id, ca.rac_code, ca.status, ca.requester_type, c.dni, c.display_name,
    sc.name, ca.created_by_name, ca.created_at, coalesce(s.status, 'NONE'),
    coalesce(ar.status, 'NONE'), ar.destination_area_id, ar.destination_area_name,
    count(*) over()
  from public.customer_attentions ca
  join public.clients c on c.id = ca.client_id
  join public.service_channels sc on sc.id = ca.service_channel_id
  left join public.attention_surveys s on s.attention_id = ca.id
  left join public.attention_referrals ar on ar.attention_id = ca.id
  where (ca.status = 'ACTIVE' or v_is_admin)
    and (coalesce(btrim(p_search), '') = ''
      or ca.rac_code ilike '%' || btrim(p_search) || '%'
      or c.display_name ilike '%' || btrim(p_search) || '%'
      or c.email ilike '%' || btrim(p_search) || '%'
      or (regexp_replace(p_search, '[^0-9]', '', 'g') <> ''
        and c.dni ilike '%' || regexp_replace(p_search, '[^0-9]', '', 'g') || '%'))
    and (p_survey_status is null or coalesce(s.status, 'NONE') = p_survey_status)
    and (p_referral_status is null or coalesce(ar.status, 'NONE') = p_referral_status)
    and (p_area_id is null or ar.destination_area_id = p_area_id)
    and (
      p_admission_process_id is null
      or exists (
        select 1 from public.attention_admission_processes aap
        where aap.attention_id = ca.id
          and aap.admission_process_id = p_admission_process_id
      )
    )
  order by ca.created_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 100))
  offset (greatest(coalesce(p_page, 1), 1) - 1) * greatest(1, least(coalesce(p_limit, 10), 100));
end;
$$;

alter table public.admission_processes enable row level security;
alter table public.attention_admission_processes enable row level security;

grant select, insert, update on public.admission_processes to authenticated;
grant select on public.attention_admission_processes to authenticated;

create policy "admission_processes_select_authenticated"
on public.admission_processes for select to authenticated
using (not public.is_active_tablet_session());

create policy "admission_processes_insert_admin"
on public.admission_processes for insert to authenticated
with check (public.is_admin() and not public.is_active_tablet_session());

create policy "admission_processes_update_admin"
on public.admission_processes for update to authenticated
using (public.is_admin() and not public.is_active_tablet_session())
with check (public.is_admin() and not public.is_active_tablet_session());

create policy "attention_admission_processes_select_authorized"
on public.attention_admission_processes for select to authenticated
using (
  not public.is_active_tablet_session()
  and exists (
    select 1
    from public.customer_attentions ca
    left join public.attention_referrals ar on ar.attention_id = ca.id
    where ca.id = attention_id
      and (ca.status = 'ACTIVE' or public.is_admin())
      and (
        public.is_admin()
        or ca.created_by = auth.uid()
        or ar.destination_area_id = (
          select p.area_id from public.profiles p where p.id = auth.uid()
        )
      )
  )
);

revoke execute on function public.create_customer_attention_v3(
  jsonb, uuid, text, text, jsonb, text, jsonb, uuid, uuid, text, text
) from public, anon;
revoke execute on function public.update_customer_attention_v3(
  uuid, jsonb, uuid, text, text, jsonb, jsonb, uuid, uuid, text, text
) from public, anon;
revoke execute on function public.list_customer_attentions_v3(
  integer, integer, text, text, text, uuid, uuid
) from public, anon;

grant execute on function public.create_customer_attention_v3(
  jsonb, uuid, text, text, jsonb, text, jsonb, uuid, uuid, text, text
) to authenticated;
grant execute on function public.update_customer_attention_v3(
  uuid, jsonb, uuid, text, text, jsonb, jsonb, uuid, uuid, text, text
) to authenticated;
grant execute on function public.list_customer_attentions_v3(
  integer, integer, text, text, text, uuid, uuid
) to authenticated;

notify pgrst, 'reload schema';
commit;

