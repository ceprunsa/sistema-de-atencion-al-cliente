# Avisos grupales y contador de derivaciones

Esta etapa conecta las derivaciones con la bandeja de correo instalada en la etapa 1 y agrega el contador del Sidebar para el área del usuario autenticado.

## 1. Aplicar SQL

En una base existente que ya tenga instalada la etapa original de avisos,
ejecuta una sola vez:

`supabase/migrations/20261026000000_area_group_referral_email.sql`

En una base nueva ejecuta `supabase/sql/07_referral_notifications_badge.sql`
después del SQL `06` y luego `supabase/sql/10_area_group_referral_email.sql`
después del SQL `09`. No ejecutes simultáneamente el SQL `10` y su migración equivalente.

Antes de crear o editar áreas configura un correo de grupo único con dominio
`@cepr.unsa.pe`. Las áreas históricas sin correo se muestran como pendientes de
configuración y no pueden recibir nuevas derivaciones.

## 2. Avisos por correo

Al insertar una derivación pendiente se crea una sola fila en `email_outbox`,
dirigida al correo grupal del área destino. Los correos personales de los
perfiles no intervienen en este aviso y conservan sus otros usos.

La clave de idempotencia combina derivación, área y correo grupal normalizado.
Una repetición de la operación no duplica el aviso. Si la derivación cambia de
área, se cancelan los avisos todavía no entregados del área anterior y se crea
el del grupo nuevo. Si cambia el correo antes de entregar el mensaje, se
cancela el intento anterior y se crea uno para la dirección vigente. Un aviso
ya enviado no se reenvía automáticamente.

El worker `mail-dispatch` valida el formato del correo. Una dirección inválida queda en `FAILED_PERMANENT` con `INVALID_RECIPIENT` y no vuelve a intentarse.

El correo incluye únicamente el código RAC, el nombre del área destino y un enlace autenticado al detalle de la atención.

Antes de cada intento, `mail-dispatch` vuelve a comprobar que la derivación
siga pendiente, la atención continúe activa, el área siga siendo el destino y
el correo coincida con el grupo configurado. Si el hecho ya no es válido, no
llama a Apps Script y registra `SOURCE_NO_LONGER_VALID`.

## 3. Contador y Realtime

`get_pending_referral_count()` cuenta derivaciones con estado `PENDING`, atención `ACTIVE` y área destino igual al área del perfil autenticado. Para administradores también cuenta solamente su propia área. Un perfil sin área obtiene cero.

Los cambios se publican en el canal privado `referrals:area:<area-id>`. El Sidebar invalida el contador y el listado del buzón al recibir un evento, al reconectarse o al recuperar conexión de red. La política de `realtime.messages` impide suscribirse al canal de otra área.

Confirma que Realtime esté habilitado en el proyecto tal como se describe en `SUPABASE_WORKSTATIONS_SETUP.md`.

## 4. Verificación

Ejecuta `supabase/tests/verify_referral_notifications_badge.sql` y
`supabase/tests/verify_area_group_referral_email.sql`. Las verificaciones
estructurales deben devolver `passed = true`; las consultas finales no deben
mostrar duplicados.

Luego crea una atención con derivación hacia un área que tenga correo grupal.
Verifica que exista exactamente una fila para la derivación:

```sql
select event_type, recipient_email, status, attempt_count,
  last_error_code, created_at
from public.email_outbox
where event_type = 'REFERRAL_CREATED'
order by created_at desc
limit 20;
```

El evento comienza en `PENDING` y debe pasar a `SENT` cuando lo procese el cron. El usuario del área destino debe ver el contador aumentado sin recargar. Al resolver o inhabilitar la derivación, el contador debe disminuir.
