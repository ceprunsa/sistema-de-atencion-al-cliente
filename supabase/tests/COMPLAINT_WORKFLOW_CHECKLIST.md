# Verificación funcional del módulo de quejas

Ejecutar en un proyecto de prueba después de aplicar manualmente los SQL `20` al `25`, desplegar `mail-dispatch` y `public-complaint-response`, y configurar el cron de vencimientos.

## Preparación

- Configurar un área activa como área de cierre.
- Tener dos áreas activas con correo grupal: responsable y cierre.
- Tener un usuario activo en cada área y un administrador.
- Tener un cliente con DNI, nombres, apellidos y correo válido.
- Confirmar que el administrador sin pertenencia al área solo puede observar, no operar.

## Flujo con conformidad

1. Crear una queja y comprobar el formato `RQ-001-AAAA`.
2. Confirmar un único correo al área responsable.
3. Iniciar la gestión con un usuario del área responsable.
4. Registrar decisión, análisis y acciones.
5. Confirmar que se creó la versión 1 y que el cliente recibió un enlace sin DNI ni correo en la URL.
6. Abrir el enlace y marcar conformidad.
7. Confirmar el estado `PENDING_CLOSURE_REVIEW` y que un segundo uso del enlace sea rechazado.
8. Aprobar la revisión de cierre.
9. Registrar decisión SAC negativa y confirmar `CLOSED_AGREED` sin número SAC.

## Desacuerdos sucesivos

1. Responder “No estoy de acuerdo” con motivo obligatorio.
2. Confirmar `RETURNED_BY_CLIENT` y visibilidad del motivo.
3. Registrar una nueva gestión y confirmar versión 2.
4. Confirmar que el enlace anterior permanece cerrado y el nuevo vence siete días después de su entrega.
5. Repetir el desacuerdo para verificar que las versiones y respuestas anteriores no se sobrescriben.

## Devolución por cierre

1. Dar conformidad a una versión enviada.
2. Marcar la revisión de cierre como no adecuada.
3. Confirmar `RETURNED_BY_CLOSURE`, observaciones históricas y un correo al área responsable.
4. Registrar acciones corregidas y comprobar una versión y enlace nuevos.

## Vencimiento

1. Usar una copia de prueba con `expires_at` vencido y ejecutar `select public.expire_pending_complaint_responses();`.
2. Confirmar `CLOSED_NO_RESPONSE`, token `EXPIRED` y ausencia de conformidad atribuida.
3. Confirmar el correo al área de cierre.
4. Registrar seguimiento y verificar que el estado siga siendo `CLOSED_NO_RESPONSE`.
5. Registrar una decisión SAC y verificar que el tipo de cierre no cambie.

## SAC

1. En otra queja aprobada, decidir que sí corresponde SAC.
2. Confirmar código `SAC-001-AAAA`, relación única con la queja y cierre final.
3. Intentar repetir la decisión y comprobar que sea rechazada.
4. Crear SAC simultáneamente en dos quejas distintas y comprobar correlativos diferentes.

## Permisos y seguridad

- El creador puede consultar durante todo el ciclo, pero no gestionar si no pertenece al área correspondiente.
- El administrador ve todo, pero solo opera cuando pertenece al área responsable o de cierre.
- `anon` no puede ejecutar RPC internas ni consultar tablas de quejas.
- El endpoint público acepta únicamente tokens válidos y limita solicitudes.
- El detalle autenticado nunca devuelve `token_hash` ni el token sin procesar.

## Auditoría final

Ejecutar `verify_complaints_end_to_end.sql`. Todos los registros deben devolver `passed = true` y `violations = 0` o `NULL`.
