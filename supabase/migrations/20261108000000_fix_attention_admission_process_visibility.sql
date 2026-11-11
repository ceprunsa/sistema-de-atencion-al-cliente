-- Corrige la lectura de los procesos asociados desde el detalle del RAC.
-- La autorizacion conserva el alcance original: administrador, creador de la
-- atencion o usuario perteneciente al area receptora de su derivacion.
begin;

create or replace function public.can_view_attention_admission_processes(
  p_attention_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.customer_attentions ca
    left join public.attention_referrals ar on ar.attention_id = ca.id
    where ca.id = p_attention_id
      and (ca.status = 'ACTIVE' or public.is_admin())
      and (
        public.is_admin()
        or ca.created_by = auth.uid()
        or ar.destination_area_id = (
          select p.area_id
          from public.profiles p
          where p.id = auth.uid()
        )
      )
  );
$$;

alter function public.can_view_attention_admission_processes(uuid)
owner to postgres;
revoke execute on function public.can_view_attention_admission_processes(uuid)
from public, anon;
grant execute on function public.can_view_attention_admission_processes(uuid)
to authenticated;

drop policy if exists "attention_admission_processes_select_authorized"
on public.attention_admission_processes;

create policy "attention_admission_processes_select_authorized"
on public.attention_admission_processes
for select
to authenticated
using (
  not public.is_active_tablet_session()
  and public.can_view_attention_admission_processes(attention_id)
);

notify pgrst, 'reload schema';
commit;
