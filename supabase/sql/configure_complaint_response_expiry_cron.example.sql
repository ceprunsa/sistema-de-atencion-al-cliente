-- Configuracion manual opcional para cerrar quejas vencidas cada cinco minutos.
-- No usa Vault ni realiza llamadas HTTP. Requiere habilitar pg_cron en Supabase.
create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'expire-complaint-responses'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'expire-complaint-responses',
  '*/5 * * * *',
  $cron$select public.expire_pending_complaint_responses();$cron$
);

select jobid, jobname, schedule, command, active
from cron.job
where jobname = 'expire-complaint-responses';
