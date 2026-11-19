-- Corrige la resolucion de digest() cuando pgcrypto esta instalado en extensions.
-- Ejecutar solamente despues de 28_attention_exports.sql.

begin;

do $fix_search_path$
declare
  v_pgcrypto_schema text;
begin
  select namespace.nspname
  into v_pgcrypto_schema
  from pg_extension extension
  join pg_namespace namespace on namespace.oid = extension.extnamespace
  where extension.extname = 'pgcrypto';

  if v_pgcrypto_schema is null then
    raise exception 'La extension pgcrypto no esta instalada.';
  end if;

  execute format(
    'alter function public.request_attention_export(text,text,text,text,uuid,uuid,uuid,uuid,date,date) set search_path = public, storage, %I, pg_temp',
    v_pgcrypto_schema
  );
end;
$fix_search_path$;

notify pgrst, 'reload schema';
commit;
