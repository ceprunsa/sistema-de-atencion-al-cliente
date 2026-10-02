# Verificación integral del Registro de Atención al Cliente

Esta guía corresponde a la etapa 7. Las pruebas que crean datos deben ejecutarse
en una instancia de desarrollo o pruebas, no en producción.

## 1. Validación del frontend

Desde la raíz del proyecto:

```bash
npm run verify
```

El comando ejecuta ESLint, TypeScript y la compilación de producción sin añadir
dependencias nuevas.

## 2. Auditoría de Supabase

Ejecuta `supabase/tests/verify_customer_service.sql` en SQL Editor. Es una
consulta de solo lectura que debe ejecutarse después del SQL `04`: no crea, actualiza ni elimina registros. El resultado
debe mostrar `overall_status = OK` y `passed = true` en todas las filas.

La auditoría comprueba tablas, RLS, políticas, permisos RPC, catálogos,
correlativos, solicitantes, auditoría de inhabilitaciones e historial de
derivaciones.

## 3. Usuarios de prueba

Prepara mediante invitaciones normales cuatro cuentas con datos ficticios:

| Cuenta | Rol | Área |
| --- | --- | --- |
| A | Administrador | Área A |
| U-A | Usuario | Área A |
| U-B | Usuario | Área B |
| U-S | Usuario | Sin área |

No compartas access tokens ni la clave `service_role`.

## 4. Matriz funcional

| Caso | Ejecución | Resultado esperado |
| --- | --- | --- |
| Crear atención | A y U-A registran una atención | Ambos pueden crearla y reciben un código RAC único |
| DNI existente | Crear otra atención con el mismo DNI | Se reutiliza el cliente y se autocompletan sus datos |
| DNI inválido | Buscar menos de ocho dígitos | React impide continuar y la RPC también lo rechaza |
| Múltiples temas | Elegir temas de tipos diferentes | Todos aparecen una sola vez en el detalle |
| Solicitante | Elegir Postulante | Guarda sin parentesco ni detalle adicional |
| Familiar | Elegir un parentesco regular | Guarda el parentesco sin detalle adicional |
| Familiar: Otro | Elegir Otro sin/con detalle | Exige la especificación y luego la muestra en el detalle |
| Solicitante: Otro | Dejar vacío/completar quién consulta | Exige la descripción y luego la muestra en el detalle |
| Cambio de solicitante | Alternar entre las tres opciones | Limpia los campos condicionales que ya no corresponden |
| Justificación de faltas | Seleccionar el tema | Se guarda sin solicitar una cantidad adicional |
| Orden visual | Abrir creación y edición | La derivación aparece antes de la conclusión |
| Dictado con texto previo | Escribir texto e iniciar el micrófono | El reconocimiento se agrega sin reemplazar ni duplicar el texto |
| Detener dictado | Pulsar detener o salir del formulario | El micrófono deja de escuchar |
| Dictado no disponible | Denegar permiso o usar navegador incompatible | Informa el problema y permite seguir escribiendo manualmente |
| Guardado con dictado | Dictar y revisar el texto | No guarda hasta pulsar el botón normal del formulario |
| Derivación | Derivar desde A hacia Área B | El detalle muestra área, autor, fecha y estado pendiente |
| Concluir derivación | Abrir con U-B | Puede registrar la conclusión |
| Área incorrecta | Abrir la misma derivación con U-A o U-S | No aparece el formulario y la RPC rechaza el intento |
| Editar | Abrir una atención activa con A | Puede editar cliente, medio, temas, conclusión y derivación |
| Editar como usuario | Abrir `/attentions/:id/edit` con U-A | Redirige a acceso prohibido y la RPC rechaza el intento |
| Inhabilitar | A registra una causa | Conserva causa, administrador y fecha; no admite más acciones |
| Visibilidad | Buscar la inhabilitada con U-A y con A | U-A no la recibe; A sí la ve marcada como inhabilitada |
| Medio inhabilitado | Inhabilitar un medio ya usado | No aparece en nuevas atenciones y sigue en el historial |
| Área histórica | Eliminar un área con derivación concluida | El detalle conserva el nombre histórico del área |
| Área pendiente | Eliminar un área con derivación pendiente | Supabase rechaza la eliminación |
| Mesa exclusiva | Asignar dos usuarios a la misma mesa o dos mesas al mismo usuario | Supabase rechaza la segunda asignación |
| Tablet exclusiva | Vincular una segunda tablet a una mesa activa | Supabase rechaza la vinculación |
| Recuperación tablet | Recargar `/tablet` con una encuesta enviada | Recupera la encuesta desde la base |
| Bloqueo por encuesta | Intentar crear otra atención con encuesta abierta | La RPC rechaza el registro |
| Encuesta completada | Elegir una respuesta | Guarda respuesta y fecha de realización una sola vez |
| Encuesta omitida | Omitir antes o después de enviarla | Cierra sin respuesta ni fecha de realización |
| Misma área | Derivar al área propia | La interfaz no la ofrece y Supabase la rechaza |
| Usuario sin área | Crear una derivación | Puede seleccionar cualquier área activa |
| Buzón de área | Abrir con usuarios de áreas distintas | Solo el área destino puede resolver |
| Buzón administrador | Abrir como administrador | Ve todas las pendientes, pero solo resuelve las de su área |
| Inhabilitar derivación | Administrador registra un motivo | Queda cerrada sin conclusión y conserva auditoría |
| Cancelación en cascada | Inhabilitar atención con encuesta/derivación pendiente | Ambas pasan a canceladas y liberan la mesa |
| Concurrencia de encuesta | Responder dos veces simultáneamente | Solo una operación tiene éxito |

## 5. Prueba de concurrencia RAC

En la instancia de pruebas, abre sesiones autenticadas independientes y envía
al menos diez registros de atención simultáneamente. Después ejecuta:

```sql
select rac_year, rac_number, rac_code, created_at
from public.customer_attentions
where created_at >= now() - interval '10 minutes'
order by rac_year, rac_number;
```

No deben existir códigos ni números repetidos. Puede haber saltos si alguna
transacción fue revertida; los números sí deben ser únicos y crecientes dentro
del año. Ejecuta nuevamente el auditor SQL para confirmar que el contador no
quedó detrás del mayor número registrado.

## 6. Criterio de cierre

La etapa se considera aprobada cuando:

1. `npm run verify` termina sin errores.
2. El auditor SQL devuelve únicamente filas con `passed = true`.
3. Todos los casos de la matriz cumplen su resultado esperado.
4. La prueba concurrente no genera códigos RAC duplicados.
5. La consola del navegador no presenta errores en los flujos principales.
