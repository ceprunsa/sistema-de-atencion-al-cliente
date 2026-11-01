# Sistema de Atención al Cliente CEPRUNSA

Aplicación Vite + React + TypeScript conectada a Supabase. Incluye usuarios e invitaciones, áreas, medios de atención, registro RAC, derivaciones por área, mesas de trabajo, encuestas presenciales mediante tablet, servicio protegido de correo y consulta segura de DNI.

## Desarrollo

```bash
npm install
npm run dev
```

Variables requeridas en `.env`:

```env
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA
```

## Verificación

```bash
npm run verify
```

## Base nueva desde cero

Ejecuta en SQL Editor, en este orden:

1. `supabase/sql/01_setup.sql`
2. `supabase/sql/03_customer_service.sql`
3. `supabase/sql/04_workstations_surveys_referral_inbox.sql`
4. `supabase/sql/05_email_delivery_foundation.sql`
5. `supabase/sql/06_dni_lookup_foundation.sql`
6. `supabase/sql/07_referral_notifications_badge.sql`
7. `supabase/sql/08_attention_email_surveys.sql`
8. `supabase/sql/09_referral_resolution_email_survey.sql`
9. `supabase/sql/10_area_group_referral_email.sql`
10. `supabase/sql/11_attention_registration_access.sql`
11. `supabase/sql/12_service_channel_client_identity.sql`
12. `supabase/sql/13_admission_processes.sql`
13. `supabase/sql/14_dashboard_statistics.sql`
14. `supabase/sql/15_dashboard_attention_trend.sql`
15. `supabase/sql/16_email_attention_import_metadata.sql`
16. `supabase/sql/17_gmail_answered_exchange.sql`
17. Configura y ejecuta `supabase/sql/02_bootstrap_admin.sql` antes del primer ingreso.

Después configura el hook de invitaciones, OAuth y Realtime siguiendo `SUPABASE_WORKSTATIONS_SETUP.md`.

## Base existente

Si la base ya tiene instalados los módulos anteriores, ejecuta las migraciones
pendientes en orden. Para el correo grupal de áreas ejecuta una sola vez:

`supabase/migrations/20261026000000_area_group_referral_email.sql`

Si ya ejecutaste el intercambio Gmail anterior, aplica después:

`supabase/sql/18_remove_delegate_name.sql`

No ejecutes simultáneamente esa migración y el SQL `10`: contienen la misma ampliación.

Para habilitar la verificación previa de mesa al registrar atenciones, ejecuta una sola vez:

`supabase/migrations/20261026010000_attention_registration_access.sql`

No ejecutes simultáneamente esa migración y el SQL `11`: contienen la misma ampliación.

Para clasificar los medios y admitir clientes de correo sin DNI, ejecuta una sola vez:

`supabase/migrations/20261026020000_service_channel_client_identity.sql`

No ejecutes simultáneamente esa migración y el SQL `12`: contienen la misma ampliación. Después clasifica cualquier medio activo existente y vuelve a desplegar la función `dni-lookup`.

Para agregar el catálogo de procesos y sus etiquetas en las atenciones, ejecuta una sola vez:

`supabase/migrations/20261026030000_admission_processes.sql`

No ejecutes simultáneamente esa migración y el SQL `13`: contienen la misma ampliación.

Para habilitar el Dashboard estadístico agregado, ejecuta una sola vez:

`supabase/migrations/20261026040000_dashboard_statistics.sql`

No ejecutes simultáneamente esa migración y el SQL `14`: contienen la misma ampliación.

Para agregar la serie temporal diaria o mensual al Dashboard, ejecuta una sola vez:

`supabase/migrations/20261026050000_dashboard_attention_trend.sql`

No ejecutes simultáneamente esa migración y el SQL `15`: contienen la misma ampliación.

Para agregar las fechas, el mensaje original, los adjuntos visibles y el origen de las atenciones por correo, ejecuta una sola vez:

`supabase/migrations/20261028000000_email_attention_import_metadata.sql`

No ejecutes simultáneamente esa migración y el SQL `16`: contienen la misma ampliación. Las RPC v3 se conservan temporalmente para permitir el despliegue gradual del formulario; la integración nueva utilizará las RPC v4.

Para exigir un intercambio Gmail recibido y respondido, con ambas fechas verificadas, identidades y trazabilidad, ejecuta una sola vez:

`supabase/migrations/20261031000000_gmail_answered_exchange.sql`

No ejecutes simultáneamente esa migración y el SQL `17`: contienen la misma ampliación. Los registros anteriores permanecen compatibles; las nuevas importaciones usarán la RPC v5 y `gmail_import_version = 2`.

Para instalar y desplegar el servicio de correo consulta `MAIL_SERVICE_SETUP.md`.

Para configurar la consulta externa de DNI consulta `DNI_LOOKUP_SETUP.md`.

Para activar los avisos y el contador de derivaciones consulta `REFERRAL_NOTIFICATIONS_SETUP.md`.

Para habilitar las encuestas de atención por correo consulta `ATTENTION_EMAIL_SURVEY_SETUP.md`.

Para habilitar el correo de resolución y la encuesta independiente de derivaciones consulta `REFERRAL_RESOLUTION_SURVEY_SETUP.md`.

## Extensión Chrome para Gmail

La carpeta `chrome-extension/` contiene el código fuente compartido de la
extensión Manifest V3. Ejecuta `npm run build:extension` para generar dos
carpetas listas para Chrome: `dist/chrome-extension-local` y
`dist/chrome-extension-production`. La primera abre únicamente el puerto local
4000 y la segunda únicamente el dominio desplegado. Consulta
`chrome-extension/README.md`.

La precarga se conserva en `chrome.storage.session`, asociada exclusivamente a
la pestaña abierta por la extensión. Se elimina al guardar, descartarla, cerrar
la pestaña, vencer 30 minutos o reiniciar Chrome.

`npm run verify` también valida los manifests, permisos, dominios y sintaxis de
la extensión. Para la prueba manual completa consulta
`chrome-extension/TESTING.md`.

## Reinicio de datos para producción

Después de instalar y verificar todas las ampliaciones, el archivo
`supabase/sql/reset_application_data_keep_admin_and_catalogs.sql` permite
vaciar los datos de prueba. Debe ejecutarse manualmente y una sola vez desde
el SQL Editor de Supabase con una copia de seguridad previa.

El script conserva únicamente al usuario `csullcap@unsa.edu.pe`, su perfil y
rol de administrador, además de los catálogos de roles, tipos, temas y
parentescos. Elimina los demás usuarios de `auth.users`, invitaciones, áreas,
medios, procesos de admisión, clientes, mesas, atenciones, derivaciones,
encuestas, colas de correo y registros de consulta de DNI.

Antes de borrar, verifica que el administrador exista y posea el rol `ADMIN`.
También valida el resultado antes de confirmar la transacción; si alguna
condición no se cumple, se revierte toda la operación.
