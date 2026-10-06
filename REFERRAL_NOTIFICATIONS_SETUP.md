# Etapa 3: avisos y contador de derivaciones

Esta etapa conecta las derivaciones con la bandeja de correo instalada en la etapa 1 y agrega el contador del Sidebar para el área del usuario autenticado.

## 1. Aplicar SQL

En una base existente ejecuta una sola vez:

`supabase/migrations/20261007000000_referral_notifications_badge.sql`

En una base nueva ejecuta `supabase/sql/07_referral_notifications_badge.sql` después del SQL `06`. No ejecutes ambos archivos sobre la misma base.

La migración no envía avisos retroactivos por derivaciones antiguas. El contador sí incluye todas las derivaciones pendientes existentes cuya atención siga activa.

## 2. Avisos por correo

Al insertar una derivación pendiente se crea una fila en `email_outbox` para cada correo principal distinto de los perfiles activos del área destino. No se usa `additional_email` y se omiten correos vacíos.

La clave de idempotencia combina derivación, área y perfil. Una recarga o repetición de la operación no duplica el aviso. Si una derivación cambia de área, se cancelan los avisos todavía no entregados del área anterior y se crean los del área nueva. Si se resuelve, inhabilita, cancela o elimina antes del envío, sus avisos pendientes quedan en `FAILED_PERMANENT` con `REFERRAL_NO_LONGER_PENDING`.

El worker `mail-dispatch` valida el formato del correo. Una dirección inválida queda en `FAILED_PERMANENT` con `INVALID_RECIPIENT` y no vuelve a intentarse.

El correo incluye únicamente el código RAC, el nombre del área destino y un enlace autenticado al detalle de la atención.

Antes de cada intento, `mail-dispatch` vuelve a comprobar que la derivación siga pendiente, la atención continúe activa y el perfil destinatario permanezca activo, con el mismo correo y en el área destino. Si el hecho ya no es válido, no llama a Apps Script y registra `SOURCE_NO_LONGER_VALID`.

## 3. Contador y Realtime

`get_pending_referral_count()` cuenta derivaciones con estado `PENDING`, atención `ACTIVE` y área destino igual al área del perfil autenticado. Para administradores también cuenta solamente su propia área. Un perfil sin área obtiene cero.

Los cambios se publican en el canal privado `referrals:area:<area-id>`. El Sidebar invalida el contador y el listado del buzón al recibir un evento, al reconectarse o al recuperar conexión de red. La política de `realtime.messages` impide suscribirse al canal de otra área.

Confirma que Realtime esté habilitado en el proyecto tal como se describe en `SUPABASE_WORKSTATIONS_SETUP.md`.

## 4. Verificación

Ejecuta `supabase/tests/verify_referral_notifications_badge.sql`; todas las filas deben devolver `passed = true`.

Luego crea una atención con derivación hacia un área que tenga al menos un perfil activo con correo principal. Verifica:

```sql
select event_type, recipient_email, status, attempt_count,
  last_error_code, created_at
from public.email_outbox
where event_type = 'REFERRAL_CREATED'
order by created_at desc
limit 20;
```

El evento comienza en `PENDING` y debe pasar a `SENT` cuando lo procese el cron. El usuario del área destino debe ver el contador aumentado sin recargar. Al resolver o inhabilitar la derivación, el contador debe disminuir.
