# Etapa 5: resultado y encuesta de derivación

Esta etapa exige correo válido al crear una derivación y, cuando el área de destino la resuelve, envía al cliente la conclusión junto con una encuesta independiente de la atención original.

## 1. Aplicar la migración

En una base existente con las etapas 1 a 4 instaladas:

1. Abre **Supabase Dashboard → SQL Editor**.
2. Ejecuta una sola vez `supabase/migrations/20261009000000_referral_resolution_email_survey.sql`.
3. Ejecuta `supabase/tests/verify_referral_resolution_email_survey.sql`.
4. Confirma que todas las filas tengan `passed = true`.

Para una base nueva ejecuta `supabase/sql/09_referral_resolution_email_survey.sql` después del SQL `08`. No ejecutes el archivo canónico y la migración sobre la misma base.

La migración no altera derivaciones históricas. Una derivación antigua sin correo se puede resolver; su encuesta queda `CANCELLED` con el motivo correspondiente y la conclusión se conserva.

## 2. Volver a desplegar las Edge Functions

No se requiere un secreto ni un cron adicional. Conserva la configuración de correo y `PUBLIC_SURVEY_HASH_SECRET` de las etapas anteriores.

Despliega las dos funciones actualizadas:

```bash
supabase functions deploy public-survey --no-verify-jwt
supabase functions deploy mail-dispatch --no-verify-jwt
```

`mail-dispatch` valida que la derivación esté resuelta, la atención siga activa, la conclusión coincida y la encuesta continúe en cola antes de enviar. `public-survey` reconoce tanto tokens de atenciones como tokens de derivaciones.

## 3. Desplegar el frontend

Publica la versión actualizada en Vercel. No se agregan variables `VITE_` ni rutas adicionales: se reutiliza `/survey/:token`.

## 4. Prueba de una derivación nueva

1. Busca un cliente sin correo e intenta seleccionar un área de destino. El formulario debe exigir una dirección válida.
2. Ingresa un correo válido y registra la atención. La derivación y el correo del cliente deben quedar guardados.
3. Ingresa con un usuario activo del área de destino.
4. Registra la conclusión. Debe mostrarse que el correo fue agregado a la cola.
5. En `attention_referrals`, comprueba `status = 'RESOLVED'`.
6. En `referral_surveys`, comprueba `status = 'QUEUED'` y que exista `email_outbox_id`.
7. Ejecuta el worker o espera el cron. `email_outbox` y `referral_surveys` deben pasar a `SENT`.
8. El correo debe contener el RAC, la conclusión y el enlace de encuesta.
9. Responde u omite desde el enlace. La encuesta debe quedar `COMPLETED` o `SKIPPED` y no aceptar una segunda respuesta.

## 5. Pruebas complementarias

- Un administrador puede ver la derivación, pero solo resolverla cuando pertenece al área de destino.
- La encuesta original de la atención no debe cambiar al responder la encuesta de derivación.
- El vencimiento debe ser tres días posterior a `email_outbox.accepted_at`.
- Un fallo temporal debe quedar en `RETRY`; un destinatario inválido o un origen que dejó de ser válido debe quedar en `FAILED_PERMANENT`.
- Si se inhabilita la atención, una encuesta de derivación `QUEUED` o `SENT` debe pasar a `CANCELLED`.
- Una derivación histórica sin correo debe quedar resuelta, con una encuesta `CANCELLED`, sin crear un correo pendiente.
