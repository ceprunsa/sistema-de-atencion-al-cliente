begin;

create or replace function public.get_my_attention_registration_state()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_workstation_id uuid;
  v_workstation_name text;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'NO_SESSION',
      'workstationId', null,
      'workstationName', null
    );
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.status = 'active'
  ) then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'INACTIVE_PROFILE',
      'workstationId', null,
      'workstationName', null
    );
  end if;

  if public.is_active_tablet_session() then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'TABLET_SESSION',
      'workstationId', null,
      'workstationName', null
    );
  end if;

  select w.id, w.name
  into v_workstation_id, v_workstation_name
  from public.workstation_assignments wa
  join public.workstations w
    on w.id = wa.workstation_id
   and w.is_active
  where wa.user_id = v_user_id
    and wa.ended_at is null
  limit 1;

  if v_workstation_id is null then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'NO_ACTIVE_WORKSTATION',
      'workstationId', null,
      'workstationName', null
    );
  end if;

  if exists (
    select 1
    from public.attention_surveys s
    where s.workstation_id = v_workstation_id
      and (
        s.status = 'PENDING_DECISION'
        or (s.channel = 'TABLET' and s.status = 'SENT')
      )
  ) then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'PENDING_SURVEY',
      'workstationId', v_workstation_id,
      'workstationName', v_workstation_name
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'reason', null,
    'workstationId', v_workstation_id,
    'workstationName', v_workstation_name
  );
end;
$$;

revoke execute on function public.get_my_attention_registration_state()
from public, anon;

grant execute on function public.get_my_attention_registration_state()
to authenticated;

notify pgrst, 'reload schema';

commit;

