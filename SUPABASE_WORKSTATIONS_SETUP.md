# Configuración de mesas, tablet, encuestas y derivaciones

## 1. Antes de aplicar el SQL

1. Confirma que estás en el proyecto correcto de Supabase.
2. Realiza una copia de seguridad o usa primero una instancia de pruebas.
3. Verifica que `01_setup.sql`, `03_customer_service.sql` y la migración de solicitantes del 1 de octubre ya estén aplicados.
4. No ejecutes el nuevo script más de una vez.

## 2. Ampliar una base existente

1. Abre Supabase Dashboard → **SQL Editor**.
2. Crea una consulta nueva.
3. Copia todo el contenido de `supabase/migrations/20261002000000_workstations_surveys_referral_inbox.sql`.
4. Pulsa **Run**.
5. Debe finalizar sin errores. El archivo usa una transacción: ante un error no debe quedar una instalación parcial.
6. No ejecutes después `supabase/sql/04_workstations_surveys_referral_inbox.sql`, porque contiene el mismo cambio.

El script no modifica atenciones históricas. Estas aparecerán como “Sin encuesta”. Todas las atenciones creadas después de instalarlo exigirán una mesa activa y generarán su encuesta automáticamente.

Si la migración principal ya fue ejecutada antes de la corrección del buzón, ejecuta una sola vez `supabase/migrations/20261002010000_fix_referral_inbox_ambiguity.sql`. Este script reemplaza únicamente la función `list_referral_inbox` y no cambia datos. En instalaciones nuevas no es necesario ejecutarlo por separado porque el SQL canónico ya incluye la corrección.

## 3. Crear una base nueva

En un proyecto vacío ejecuta, en orden:

1. `supabase/sql/01_setup.sql`.
2. `supabase/sql/03_customer_service.sql`.
3. `supabase/sql/04_workstations_surveys_referral_inbox.sql`.
4. Edita el correo y los nombres de `supabase/sql/02_bootstrap_admin.sql` y ejecútalo.
5. Configura el hook **Before User Created** descrito en `SUPABASE_USER_LIFECYCLE.md`.
6. Ingresa por primera vez con la cuenta invitada del administrador.

## 4. Google OAuth y redirecciones

En **Authentication → URL Configuration** agrega:

- `http://localhost:4000/dashboard`
- `http://localhost:4000/tablet`
- `https://TU-DOMINIO-VERCEL/dashboard`
- `https://TU-DOMINIO-VERCEL/tablet`

Conserva la Site URL correspondiente al entorno. La tablet utiliza la misma cuenta Google del usuario, pero Supabase crea otra sesión identificada por `session_id`.

No actives **Single session per user**: computadora y tablet necesitan sesiones simultáneas. No es necesario habilitar registros anónimos ni crear usuarios especiales para tablets.

## 5. Supabase Realtime

1. Abre **Realtime → Settings**.
2. Desactiva **Allow public access** para exigir canales privados.
3. Guarda la configuración.
4. No agregues `attention_surveys` a `supabase_realtime`: se usa Broadcast, no Postgres Changes.
5. Las políticas sobre `realtime.messages` ya son creadas por el script.

Los canales son `workstation:<workstation_id>` y `operator:<user_id>`. Los eventos no contienen datos personales; la aplicación vuelve a consultar la base después de cada aviso.

## 6. Configurar mesas

1. Despliega o inicia el frontend después de aplicar el SQL.
2. Ingresa como administrador y abre **Mesas de trabajo**.
3. Crea cada mesa física.
4. Asigna exactamente un usuario activo a cada mesa.

Un usuario no puede tener dos mesas y una mesa no puede tener dos usuarios. Para liberar una mesa primero debe estar cerrada cualquier encuesta pendiente.

## 7. Vincular la tablet

1. En la tablet abre `https://TU-DOMINIO/tablet`.
2. Inicia sesión con la misma cuenta del usuario asignado.
3. Pulsa **Vincular a mi mesa**.
4. Debe aparecer **En espera** y el nombre de la mesa.
5. Pulsa **Pantalla completa** para ocultar la interfaz del navegador.
6. Confirma que aparezca **Pantalla activa**. Si el navegador no admite Wake Lock, configura manualmente el tiempo de espera de pantalla del dispositivo.

Si ya existe otra tablet activa, Supabase rechazará la vinculación. Para reemplazarla, el administrador debe desvincular la anterior desde **Mesas de trabajo** indicando un motivo.

Wake Lock requiere HTTPS (o `localhost`) y puede ser revocado por el sistema operativo, el ahorro de batería o al ocultar la pestaña. La aplicación vuelve a solicitarlo al recuperar visibilidad, pero no puede anular una restricción impuesta por la tablet.

## 8. Probar encuestas

1. En la computadora registra una atención.
2. Verifica el paso intermedio de encuesta.
3. Intenta registrar otra atención: debe rechazarse mientras la encuesta siga abierta.
4. Envía la encuesta y comprueba que la tablet muestre las cuatro respuestas sin datos del cliente.
5. Responde u omite desde la tablet.
6. La computadora debe actualizarse y habilitar “Registrar otra atención”.
7. Recarga la tablet durante una encuesta enviada: debe recuperarla desde la base.

## 9. Probar derivaciones

1. Con un usuario del Área A deriva una atención al Área B.
2. El selector no debe permitir Área A; un usuario sin área puede elegir cualquier área.
3. El usuario de Área B debe verla en su buzón y resolverla.
4. El usuario originador debe ver estado y conclusión.
5. El administrador debe ver todos los buzones, pero solo puede resolver si pertenece al área destino.
6. El administrador puede inhabilitar una derivación pendiente indicando un motivo.

## 10. Inhabilitación y concurrencia

1. Inhabilita una atención con encuesta y derivación pendientes.
2. La encuesta y derivación deben pasar a `CANCELLED` y la mesa debe liberarse.
3. Intenta resolver simultáneamente una derivación desde dos sesiones: solo una debe tener éxito.
4. Intenta responder dos veces la misma encuesta: la segunda debe rechazarse.

## 11. Auditoría final

Ejecuta `supabase/tests/verify_customer_service.sql` en SQL Editor. Todas las filas deben mostrar `passed = true` y `overall_status = OK`.

Después ejecuta:

```bash
npm run verify
```

## 12. Despliegue

1. Confirma en Vercel `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
2. No agregues `service_role` al frontend.
3. Despliega y prueba `/dashboard`, `/workstations`, `/referrals` y `/tablet`.
4. Revisa logs de Postgres y Realtime si un canal privado no se suscribe.

Esta ampliación no requiere una Edge Function nueva. Las operaciones sensibles usan funciones PostgreSQL `security definer` con validaciones internas y permisos restringidos.
