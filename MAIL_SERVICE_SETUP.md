# Etapa 1: servicio de correo

Esta etapa instala una bandeja de salida persistente, un worker de Supabase Edge Functions y un Google Apps Script que envía mensajes firmados. Todavía no crea avisos automáticos: los productores se habilitarán en las etapas de derivaciones y encuestas.

## 1. Objetos instalados

- `email_outbox`: mensaje pendiente, estado, destinatario principal, futuro CC e idempotencia.
- `email_delivery_attempts`: resultado sanitizado de cada intento.
- `claim_email_outbox_batch`: reclama lotes con `FOR UPDATE SKIP LOCKED` y recupera leases abandonados.
- `finish_email_outbox_attempt`: registra de forma atómica envíos, reintentos y fallos permanentes.
- `mail-dispatch`: construye plantillas fijas, firma la solicitud y llama a Apps Script.

Las tablas tienen RLS y no conceden acceso a `anon` ni `authenticated`. React no puede insertar destinatarios, asuntos o HTML.

## 2. Aplicar SQL

### Base existente

En Supabase Dashboard → **SQL Editor**, ejecuta una sola vez:

`supabase/migrations/20261005000000_email_delivery_foundation.sql`

No ejecutes además el archivo `05`, porque contiene la misma instalación.

### Base nueva

Ejecuta `supabase/sql/05_email_delivery_foundation.sql` después del SQL `04`.

## 3. Crear Google Apps Script

1. Ingresa a `https://script.google.com` con la cuenta Google Workspace que enviará los mensajes.
2. Crea un proyecto independiente.
3. Sustituye `Code.gs` con `integrations/google-apps-script/Code.gs`.
4. En **Configuración del proyecto**, activa la visualización del manifiesto y copia `integrations/google-apps-script/appsscript.json`.
5. En **Propiedades del script**, crea `APPS_SCRIPT_HMAC_SECRET` con un valor aleatorio de al menos 32 bytes.
6. Ejecuta manualmente `authorizeMailService` y acepta el permiso de envío de correo de la cuenta.
7. Selecciona **Implementar → Nueva implementación → Aplicación web**.
8. Configura **Ejecutar como: Yo** y acceso **Cualquier usuario**. El endpoint es público a nivel de transporte, pero rechaza todo mensaje que no tenga una firma HMAC válida.
9. Copia la URL terminada en `/exec`; no uses la URL de desarrollo `/dev`.

Apps Script no expone encabezados HTTP personalizados en el objeto documentado de `doPost(e)`. La autenticación viaja dentro de un sobre firmado y el secreto nunca se envía.

## 4. Contrato Edge Function → Apps Script

Solicitud `POST application/json`:

```json
{
  "version": 1,
  "timestamp": 1791150000,
  "nonce": "uuid-aleatorio",
  "messageId": "uuid-de-email-outbox",
  "payload": "JSON-UTF8-EN-BASE64",
  "signature": "HMAC-SHA256-EN-HEXADECIMAL"
}
```

La cadena firmada es:

```text
version.timestamp.nonce.messageId.payload
```

El payload decodificado contiene `to`, `cc`, `subject`, `htmlBody`, `textBody` y `fromName`. `cc` se mantiene vacío en esta versión, pero el contrato permite incorporarlo posteriormente.

Respuesta aceptada:

```json
{
  "ok": true,
  "messageId": "uuid",
  "acceptedAt": "2026-10-05T15:00:00.000Z",
  "duplicate": false,
  "remainingQuota": 1499
}
```

Respuesta rechazada:

```json
{
  "ok": false,
  "code": "QUOTA_EXCEEDED",
  "message": "La cuota diaria de destinatarios fue alcanzada.",
  "retryable": true,
  "retryAfterSeconds": 43200
}
```

Apps Script devuelve JSON estructurado incluso para errores porque `TextOutput` no permite controlar códigos HTTP como una API convencional.

## 5. Configurar secretos de la Edge Function

Genera dos valores aleatorios diferentes. Por ejemplo, con OpenSSL:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Usa uno como `MAIL_DISPATCH_SECRET` y el otro como `APPS_SCRIPT_HMAC_SECRET`. Este último debe coincidir exactamente con la propiedad del Apps Script.

Copia `supabase/functions/secrets.example` a un archivo local ignorado por Git, reemplaza todos los valores y ejecuta:

```bash
supabase secrets set --env-file ./ruta/a/tu-archivo.env
```

No agregues estos valores a `.env` de Vite ni uses prefijos `VITE_`.

## 6. Desplegar el worker

Desde la raíz del repositorio:

```bash
supabase functions deploy mail-dispatch --no-verify-jwt
```

`--no-verify-jwt` es necesario porque el worker usa un Bearer privado distinto al JWT de un usuario. La función compara ese valor con `MAIL_DISPATCH_SECRET` antes de acceder a la bandeja.

## 7. Programar el procesamiento

1. Abre `supabase/sql/configure_mail_dispatch_cron.example.sql`.
2. Reemplaza `TU_PROJECT_REF` y `TU_MAIL_DISPATCH_SECRET`.
3. Ejecuta el contenido una sola vez en SQL Editor.
4. Revisa **Integrations → Cron** y confirma el job `mail-dispatch-every-minute`.

El job invoca el worker cada minuto y guarda sus credenciales en Supabase Vault.

> La extensión se instala con el nombre `supabase_vault`; `vault` es únicamente
> el esquema SQL. Si el servidor no muestra `supabase_vault` en
> `pg_available_extensions`, esa instalación de PostgreSQL no incluye Supabase
> Vault y este script no debe ejecutarse almacenando el Bearer en texto plano.

## 8. Prueba controlada de la infraestructura

Esta prueba aislada aplica antes de instalar la etapa 3. Después de instalar los avisos de derivaciones, `mail-dispatch` exige comprobar una derivación y un perfil destinatario reales; utiliza entonces la prueba funcional descrita en `REFERRAL_NOTIFICATIONS_SETUP.md`.

Inserta temporalmente un evento con una dirección tuya de prueba:

```sql
insert into public.email_outbox (
  event_type, aggregate_type, aggregate_id, recipient_email,
  template_key, template_data, idempotency_key
) values (
  'REFERRAL_CREATED',
  'REFERRAL',
  gen_random_uuid(),
  'TU_CORREO_DE_PRUEBA',
  'REFERRAL_CREATED',
  jsonb_build_object(
    'racCode', 'RAC-PRUEBA-2026',
    'attentionId', gen_random_uuid(),
    'destinationAreaName', 'Area de prueba'
  ),
  'mail-service-test-' || gen_random_uuid()::text
);
```

Espera hasta un minuto y consulta:

```sql
select id, event_type, status, attempt_count, accepted_at,
  last_error_code, last_error_message
from public.email_outbox
order by created_at desc
limit 10;

select outbox_id, attempt_number, outcome, error_code, attempted_at
from public.email_delivery_attempts
order by attempted_at desc
limit 10;
```

Una dirección inválida queda en `FAILED_PERMANENT` con código `INVALID_RECIPIENT` y no vuelve a intentarse.

## 9. Recuperación e idempotencia

- Los fallos temporales se reintentan aproximadamente a 1 minuto, 5 minutos, 30 minutos, 2 horas y 12 horas.
- Después de cinco intentos, el registro queda en `FAILED_PERMANENT`.
- Apps Script serializa envíos mediante `LockService` y conserva el `messageId` aceptado durante dos días. Este plazo cubre el ciclo automático de reintentos sin exceder innecesariamente el almacenamiento limitado de Script Properties.
- Si la respuesta HTTP se pierde después del envío, el reintento recibe el mismo `acceptedAt` sin reenviar.
- Si Apps Script no puede determinar si `MailApp` alcanzó a enviar, devuelve `AMBIGUOUS_DELIVERY` y no reenvía automáticamente, priorizando evitar correos duplicados.
- Los logs solo incluyen IDs internos y códigos; no se registra destinatario, HTML, token ni secretos.

## 10. Verificación

Ejecuta `supabase/tests/verify_email_delivery_foundation.sql` en SQL Editor. Todas las filas deben devolver `passed = true`.

Después ejecuta:

```bash
npm run verify
```
