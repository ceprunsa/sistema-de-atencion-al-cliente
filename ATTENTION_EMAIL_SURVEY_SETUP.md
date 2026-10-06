# Etapa 4: encuesta de atención por correo

Esta etapa permite decidir, después de registrar una atención, entre enviar la encuesta a la tablet, enviarla al correo del cliente u omitirla. El correo se procesa mediante la bandeja asíncrona de la etapa 1.

## 1. Aplicar el SQL

En una base existente que ya tiene instaladas las etapas 1, 2 y 3:

1. Abre **Supabase Dashboard → SQL Editor**.
2. Copia todo `supabase/migrations/20261008000000_attention_email_surveys.sql`.
3. Ejecuta el script una sola vez.
4. Ejecuta `supabase/tests/verify_attention_email_surveys.sql` y confirma que todas las filas tengan `passed = true`.

Para una base nueva usa `supabase/sql/08_attention_email_surveys.sql` después del SQL `07`. Los archivos de migración y SQL canónico contienen el mismo cambio; no ejecutes ambos.

## 2. Configurar el secreto del endpoint público

Genera un valor aleatorio distinto de los secretos anteriores. Por ejemplo, con PowerShell:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Guárdalo en un archivo `.env` local que no se suba a Git:

```env
PUBLIC_SURVEY_HASH_SECRET=VALOR_GENERADO
```

Regístralo en Supabase:

```bash
supabase secrets set --env-file ./ruta/a/tu-archivo.env
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son secretos incorporados por Supabase y no deben copiarse al frontend.

## 3. Desplegar las Edge Functions

Despliega el endpoint público sin validación JWT, porque el cliente que responde no inicia sesión. La función valida el token opaco y aplica límites de solicitudes:

```bash
supabase functions deploy public-survey --no-verify-jwt
```

Vuelve a desplegar también el worker de correo. Esta versión comprueba que la encuesta, atención, token y destinatario sigan vigentes antes de enviar:

```bash
supabase functions deploy mail-dispatch --no-verify-jwt
```

No necesitas un cron nuevo. Conserva el cron de `mail-dispatch` configurado en la etapa 1.

## 4. Confirmar la URL pública

Comprueba que `PUBLIC_APP_URL` sea el dominio real del frontend, sin `/` final:

```env
PUBLIC_APP_URL=https://mi-aplicacion.vercel.app
```

El correo construye `PUBLIC_APP_URL/survey/<token>`. `vercel.json` ya redirige las rutas SPA hacia `index.html`.

## 5. Prueba controlada

1. Registra una atención con un correo de prueba válido.
2. Elige **Correo**. Debe mostrarse `Encuesta en cola de correo` y habilitarse **Registrar otra atención**.
3. Ejecuta el worker o espera el cron. En `email_outbox`, `ATTENTION_SURVEY` debe pasar a `SENT`.
4. En `attention_surveys`, el estado debe pasar de `QUEUED` a `SENT`; `token_expires_at` debe ser tres días posterior a `accepted_at`.
5. Abre el enlace recibido sin iniciar sesión. Solo debe mostrar el código RAC y las cuatro respuestas, sin datos personales.
6. Responde u omite. Debe quedar `COMPLETED` o `SKIPPED`; un segundo intento debe indicar que ya está cerrada.
7. Confirma que la tablet siga bloqueando una nueva atención hasta responder u omitir.

Si el envío queda `FAILED_PERMANENT`, la encuesta pasa a `CANCELLED`; revisa `last_error_code` y `last_error_message` de `email_outbox`.
