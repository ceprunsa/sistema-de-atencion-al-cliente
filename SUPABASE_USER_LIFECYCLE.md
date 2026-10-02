# Configuración de Supabase para un proyecto nuevo

Esta base mantiene únicamente los scripts necesarios para preparar un proyecto
nuevo de Supabase. No son migraciones para una base que ya esté en producción.

## Archivos SQL mantenidos

1. `supabase/sql/01_setup.sql`: crea tablas, funciones, índices, roles, permisos,
   políticas RLS y el hook que exige una invitación activa.
2. `supabase/sql/03_customer_service.sql`: instala las tablas, catálogos,
   funciones RPC y políticas RLS del Registro de Atención al Cliente.
3. `supabase/sql/04_workstations_surveys_referral_inbox.sql`: agrega mesas,
   tablet, encuestas, buzón de derivaciones y autorización Realtime.
4. `supabase/sql/02_bootstrap_admin.sql`: crea la invitación del primer
   administrador.

Ejecuta cada archivo una sola vez y en ese orden desde `SQL Editor`.

La carpeta `supabase/migrations` contiene únicamente actualizaciones para una
instancia que ya fue configurada. No ejecutes esas migraciones adicionalmente
al crear un proyecto nuevo, porque los SQL `01`, `03` y `04`
ya incluyen el esquema actual.

Para una instancia que ya instaló el módulo de atención antes de los ajustes de
solicitante, ejecuta una vez
`supabase/migrations/20261001000000_adjust_attention_requester.sql`.

Si además ya tiene esos ajustes, ejecuta una sola vez
`supabase/migrations/20261002000000_workstations_surveys_referral_inbox.sql`.

### Actualizar una instancia existente con áreas

Si el proyecto ya estaba funcionando antes de incorporar áreas, ejecuta una
sola vez `supabase/migrations/20260928000000_add_areas.sql`. La migración crea la
tabla, agrega las relaciones opcionales a perfiles e invitaciones y actualiza
la aceptación de invitaciones para trasladar el área al perfil.

### Instalar el módulo de atención en una instancia existente

Después de verificar que la instancia ya tiene la tabla `areas`, ejecuta una
sola vez `supabase/sql/03_customer_service.sql`. No vuelvas a ejecutar
`01_setup.sql` sobre una instancia configurada.

### Verificar el módulo de atención

Después de instalar también el SQL `04`, ejecuta `supabase/tests/verify_customer_service.sql` en
SQL Editor. La consulta es de solo lectura y todas sus filas deben indicar
`overall_status = OK` y `passed = true`. La matriz funcional completa está en
`CUSTOMER_SERVICE_VERIFICATION.md`.

## 1. Crear y configurar el proyecto

1. Crea un proyecto vacío en Supabase.
2. Configura el proveedor de autenticación utilizado por la aplicación, por
   ejemplo Google, en `Authentication > Providers`.
3. Registra las URL del frontend en `Authentication > URL Configuration`,
   incluyendo las URL de desarrollo y producción autorizadas.
4. Ejecuta completo `supabase/sql/01_setup.sql` en `SQL Editor`.
5. Ejecuta completo `supabase/sql/03_customer_service.sql`.
6. Ejecuta completo `supabase/sql/04_workstations_surveys_referral_inbox.sql`.

## 2. Crear el primer administrador

Edita una copia de `supabase/sql/02_bootstrap_admin.sql` y reemplaza:

- `CAMBIAR_ADMIN@EJEMPLO.COM` por el correo real;
- los nombres y apellidos de ejemplo por los del administrador.

Ejecuta el archivo modificado en `SQL Editor`. No confirmes ese cambio con
datos personales reales en Git.

## 3. Activar el Auth Hook

En Supabase Dashboard:

1. Abre `Authentication > Hooks`.
2. Selecciona `Before User Created`.
3. Elige una función PostgreSQL.
4. Selecciona `public.hook_require_user_invitation`.
5. Guarda y habilita el hook.

Mantén habilitado `Allow new users to sign up`: el hook es quien permite o
rechaza el primer ingreso según la invitación. Así, un correo no invitado no
queda almacenado en `auth.users`.

## 4. Desplegar la Edge Function

Desde la raíz del repositorio:

```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase functions deploy delete-user
```

La función usa `npm:@supabase/supabase-js@2`, por lo que no es necesario
instalar sus dependencias Deno dentro del frontend. Supabase proporciona a la
función `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`; nunca copies la clave
`service_role` a variables `VITE_*` ni al navegador.

La función comprueba que quien solicita la eliminación tenga una sesión válida,
sea administrador y no intente eliminar su propia cuenta. Al borrar el usuario
de Auth, la relación `ON DELETE CASCADE` limpia su perfil y sus roles.

## 5. Configurar y desplegar el frontend

Configura las variables públicas correspondientes al proyecto:

```env
VITE_SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=TU_CLAVE_ANON_O_PUBLISHABLE
```

Despliega el frontend después de desplegar `delete-user`. El primer
administrador debe ingresar con el mismo correo que se registró en el script de
bootstrap; durante ese acceso se crea el perfil y se consume la invitación.

## 6. Validación mínima

1. Un correo sin invitación debe ser rechazado y no aparecer en
   `Authentication > Users`.
2. El correo del administrador debe crear su usuario, perfil y rol `ADMIN`.
3. Un administrador debe poder invitar, editar y eliminar a otro usuario.
4. La eliminación debe retirar el registro de Auth, el perfil y sus roles.
5. Un usuario normal no debe poder invocar `delete-user` correctamente.

Si un usuario posee objetos en Storage u otros registros con referencias que no
usen cascada, primero elimínalos o reasígnalos. Un access token ya emitido puede
seguir siendo válido hasta que expire, por lo que conviene usar expiraciones
cortas para operaciones sensibles.

## 7. Keep-alive opcional con GitHub Actions

El workflow `.github/workflows/supabase-keep-alive.yml` llama una vez al día a
la Edge Function `keep-alive`. La función realiza una lectura mínima de la tabla
`roles`; no modifica datos ni requiere cambios adicionales en los SQL.

Genera un secreto aleatorio de al menos 32 bytes y regístralo en Supabase:

```bash
npx supabase secrets set KEEP_ALIVE_SECRET=TU_SECRETO_ALEATORIO
npx supabase functions deploy keep-alive --no-verify-jwt
```

En GitHub abre `Settings > Secrets and variables > Actions` y crea estos
Repository secrets:

- `SUPABASE_FUNCTION_URL`:
  `https://TU_PROJECT_REF.supabase.co/functions/v1/keep-alive`
- `KEEP_ALIVE_SECRET`: exactamente el mismo valor configurado en Supabase.

Confirma los cambios en GitHub y ejecuta inicialmente el workflow desde
`Actions > Supabase keep-alive > Run workflow`. Una respuesta HTTP 200 con
`success: true` confirma que la consulta llegó a PostgreSQL.

La función se despliega con `--no-verify-jwt` porque la autenticación se realiza
con el secreto fuerte del encabezado `x-keep-alive-secret`. Nunca escribas ese
valor directamente en el workflow ni lo expongas como variable `VITE_*`.
