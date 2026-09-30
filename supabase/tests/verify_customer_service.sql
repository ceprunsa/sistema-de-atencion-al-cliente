-- Auditoría de solo lectura del módulo Registro de Atención al Cliente.
-- Ejecutar después de instalar 01_setup.sql y 03_customer_service.sql.
-- Todas las filas deben mostrar passed = true.

with expected_tables(name) as (
  values ('clients'), ('service_channels'), ('consultation_types'),
    ('consultation_topics'), ('kinship_types'), ('rac_counters'),
    ('customer_attentions'), ('attention_topics'), ('attention_referrals')
),
expected_policies(name) as (
  values
    ('clients_select_authenticated'), ('clients_update_admin'),
    ('service_channels_select_authenticated'), ('service_channels_insert_admin'),
    ('service_channels_update_admin'), ('consultation_types_select_authenticated'),
    ('consultation_types_insert_admin'), ('consultation_types_update_admin'),
    ('consultation_topics_select_authenticated'), ('consultation_topics_insert_admin'),
    ('consultation_topics_update_admin'), ('kinship_types_select_authenticated'),
    ('kinship_types_insert_admin'), ('kinship_types_update_admin'),
    ('customer_attentions_select_by_status'),
    ('attention_topics_select_visible_attention'),
    ('attention_referrals_select_visible_attention')
),
expected_types(name) as (
  values ('Información general'), ('Servicios Administrativos'), ('Académica'),
    ('Talento Humano'), ('Marketing y Comunicaciones'), ('Calidad')
),
expected_topics(type_name, topic_name) as (
  values
    ('Información general', 'Procesos'),
    ('Información general', 'Requisitos'),
    ('Información general', 'Fechas'),
    ('Información general', 'Beneficios'),
    ('Información general', 'Inversión'),
    ('Información general', 'Horarios'),
    ('Información general', 'Evaluación previa'),
    ('Información general', 'Agregar código modular'),
    ('Información general', 'Corrección de datos'),
    ('Información general', 'Correo registrado en SisAdmisión'),
    ('Información general', 'Correo CEPRUNSA'),
    ('Servicios Administrativos', 'Exoneración de pagos / Retiro'),
    ('Servicios Administrativos', 'Solicitud de grabaciones'),
    ('Servicios Administrativos', 'Justificación de faltas'),
    ('Servicios Administrativos', 'Constancia de Prestación de Servicios'),
    ('Servicios Administrativos', 'Pago de cuotas'),
    ('Servicios Administrativos', 'Cambio de turno'),
    ('Servicios Administrativos', 'Cambio de carrera'),
    ('Académica', 'No está en grupo de WhatsApp'),
    ('Académica', 'Monitores'), ('Académica', 'Supervisores'),
    ('Académica', 'Personal de Enseñanza'),
    ('Talento Humano', 'Capacitaciones'), ('Talento Humano', 'Evaluaciones'),
    ('Talento Humano', 'Comunicación en el proceso de convocatoria'),
    ('Marketing y Comunicaciones', 'Información'),
    ('Marketing y Comunicaciones', 'Mala imagen'),
    ('Marketing y Comunicaciones', 'Contenido'),
    ('Calidad', 'Sensibilización de los procesos de calidad')
),
checks(check_name, passed, detail) as (
  select 'Tablas requeridas',
    not exists (
      select 1 from expected_tables e
      where to_regclass('public.' || e.name) is null
    ),
    'Las nueve tablas del módulo deben existir.'

  union all
  select 'RLS habilitado',
    not exists (
      select 1 from expected_tables e
      join pg_class c on c.oid = to_regclass('public.' || e.name)
      where not c.relrowsecurity
    ),
    'RLS debe estar habilitado en todas las tablas del módulo.'

  union all
  select 'Políticas RLS requeridas',
    not exists (
      select 1 from expected_policies e
      where not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.policyname = e.name
      )
    ),
    'Comprueba lectura por estado y administración protegida.'

  union all
  select 'Funciones RPC instaladas',
    to_regprocedure('public.create_customer_attention(jsonb,uuid,text,text,jsonb,uuid,uuid)') is not null
      and to_regprocedure('public.update_customer_attention(uuid,jsonb,uuid,text,text,jsonb,uuid,uuid)') is not null
      and to_regprocedure('public.disable_customer_attention(uuid,text)') is not null
      and to_regprocedure('public.set_service_channel_status(uuid,boolean)') is not null
      and to_regprocedure('public.conclude_attention_referral(uuid,text)') is not null,
    'Las operaciones sensibles deben realizarse mediante RPC.'

  union all
  select 'RPC sin acceso anónimo',
    not coalesce(has_function_privilege('anon', to_regprocedure('public.create_customer_attention(jsonb,uuid,text,text,jsonb,uuid,uuid)'), 'EXECUTE'), false)
      and not coalesce(has_function_privilege('anon', to_regprocedure('public.update_customer_attention(uuid,jsonb,uuid,text,text,jsonb,uuid,uuid)'), 'EXECUTE'), false)
      and not coalesce(has_function_privilege('anon', to_regprocedure('public.disable_customer_attention(uuid,text)'), 'EXECUTE'), false)
      and not coalesce(has_function_privilege('anon', to_regprocedure('public.conclude_attention_referral(uuid,text)'), 'EXECUTE'), false),
    'El rol anon no debe ejecutar RPC del módulo.'

  union all
  select 'RPC disponibles para autenticados',
    coalesce(has_function_privilege('authenticated', to_regprocedure('public.create_customer_attention(jsonb,uuid,text,text,jsonb,uuid,uuid)'), 'EXECUTE'), false)
      and coalesce(has_function_privilege('authenticated', to_regprocedure('public.update_customer_attention(uuid,jsonb,uuid,text,text,jsonb,uuid,uuid)'), 'EXECUTE'), false)
      and coalesce(has_function_privilege('authenticated', to_regprocedure('public.disable_customer_attention(uuid,text)'), 'EXECUTE'), false)
      and coalesce(has_function_privilege('authenticated', to_regprocedure('public.conclude_attention_referral(uuid,text)'), 'EXECUTE'), false),
    'Las RPC validan internamente el rol, estado y área.'

  union all
  select 'RPC con seguridad de servidor',
    (
      select count(*) = 5 and bool_and(p.prosecdef)
      from pg_proc p
      where p.oid = any(array[
        to_regprocedure('public.create_customer_attention(jsonb,uuid,text,text,jsonb,uuid,uuid)'),
        to_regprocedure('public.update_customer_attention(uuid,jsonb,uuid,text,text,jsonb,uuid,uuid)'),
        to_regprocedure('public.disable_customer_attention(uuid,text)'),
        to_regprocedure('public.set_service_channel_status(uuid,boolean)'),
        to_regprocedure('public.conclude_attention_referral(uuid,text)')
      ]::regprocedure[])
    ),
    'Las cinco RPC deben ser SECURITY DEFINER y validar permisos internamente.'

  union all
  select 'Sin escritura directa de atenciones',
    not has_table_privilege('authenticated', 'public.customer_attentions', 'INSERT')
      and not has_table_privilege('authenticated', 'public.customer_attentions', 'UPDATE')
      and not has_table_privilege('authenticated', 'public.customer_attentions', 'DELETE')
      and not has_table_privilege('authenticated', 'public.attention_topics', 'INSERT')
      and not has_table_privilege('authenticated', 'public.attention_referrals', 'INSERT'),
    'La escritura debe pasar por las funciones transaccionales.'

  union all
  select 'Tipos iniciales',
    not exists (
      select 1 from expected_types e
      where not exists (
        select 1 from public.consultation_types ct where ct.name = e.name
      )
    ),
    'Los seis tipos iniciales deben permanecer en el catálogo.'

  union all
  select 'Temas iniciales',
    not exists (
      select 1 from expected_topics e
      where not exists (
        select 1 from public.consultation_topics topic
        join public.consultation_types type on type.id = topic.consultation_type_id
        where type.name = e.type_name and topic.name = e.topic_name
      )
    ),
    'Los 29 temas iniciales deben conservar su tipo.'

  union all
  select 'Justificación de faltas configurada',
    exists (
      select 1 from public.consultation_topics
      where name = 'Justificación de faltas' and requires_absence_count
    ),
    'El tema debe exigir el número de inasistencias.'

  union all
  select 'Códigos RAC únicos y válidos',
    not exists (
      select 1 from public.customer_attentions
      group by rac_code having count(*) > 1
    )
      and not exists (
        select 1 from public.customer_attentions
        where rac_code !~ '^RAC-[0-9]+-[0-9]{4}$'
          or rac_code <> 'RAC-'
            || case when rac_number < 1000 then lpad(rac_number::text, 3, '0') else rac_number::text end
            || '-' || rac_year::text
      ),
    'No debe haber duplicados ni códigos distintos de su correlativo.'

  union all
  select 'Contadores RAC consistentes',
    not exists (
      select 1
      from (
        select rac_year, max(rac_number) max_number
        from public.customer_attentions group by rac_year
      ) a
      left join public.rac_counters c on c.rac_year = a.rac_year
      where c.last_value is null or c.last_value < a.max_number
    ),
    'El contador anual no puede estar detrás del último RAC.'

  union all
  select 'Datos adicionales de temas válidos',
    not exists (
      select 1 from public.attention_topics at
      join public.consultation_topics ct on ct.id = at.topic_id
      where (ct.requires_absence_count and (at.absence_count is null or at.absence_count < 1))
         or (not ct.requires_absence_count and at.absence_count is not null)
    ),
    'Solo los temas configurados deben conservar una cantidad positiva.'

  union all
  select 'Auditoría de inhabilitaciones',
    not exists (
      select 1 from public.customer_attentions
      where (status = 'ACTIVE' and (disabled_reason is not null or disabled_by_name is not null or disabled_at is not null))
         or (status = 'DISABLED' and (nullif(btrim(disabled_reason), '') is null or nullif(btrim(disabled_by_name), '') is null or disabled_at is null))
    ),
    'Toda inhabilitación debe conservar causa, responsable y fecha.'

  union all
  select 'Historial de derivaciones',
    not exists (
      select 1 from public.attention_referrals
      where nullif(btrim(destination_area_name), '') is null
         or nullif(btrim(referred_by_name), '') is null
         or referred_at is null
         or (conclusion is null and (concluded_by_name is not null or concluded_at is not null))
         or (conclusion is not null and (nullif(btrim(concluded_by_name), '') is null or concluded_at is null))
    ),
    'Área, autores y fechas deben seguir legibles en el historial.'

  union all
  select 'Una derivación por atención',
    not exists (
      select 1 from public.attention_referrals
      group by attention_id having count(*) > 1
    ),
    'Cada atención admite como máximo una derivación.'
)
select
  case when bool_and(passed) over () then 'OK' else 'REVISAR' end as overall_status,
  check_name,
  passed,
  detail
from checks
order by passed, check_name;
