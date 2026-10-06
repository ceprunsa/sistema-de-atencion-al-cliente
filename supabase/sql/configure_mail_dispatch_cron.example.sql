-- NO ejecutar sin reemplazar primero los valores TU_*.
-- Este archivo configura secretos de Vault y un worker cada minuto.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
-- El paquete de la extensión se llama supabase_vault; `vault` es el esquema.
create extension if not exists supabase_vault with schema vault;

select vault.create_secret(
  'https://TU_PROJECT_REF.supabase.co',
  'mail_dispatch_project_url',
  'URL del proyecto para invocar mail-dispatch'
);

select vault.create_secret(
  'TU_MAIL_DISPATCH_SECRET',
  'mail_dispatch_secret',
  'Bearer privado del worker de correo'
);

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'mail-dispatch-every-minute';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'mail-dispatch-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'mail_dispatch_project_url'
    ) || '/functions/v1/mail-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'mail_dispatch_secret'
      )
    ),
    body := '{"limit":20}'::jsonb
  );
  $$
);
