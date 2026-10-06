# Etapa 2: consulta externa de DNI

El formulario busca primero el DNI en `clients`. Solo cuando no existe invoca la Edge Function autenticada `dni-lookup`. Si el proveedor no encuentra a la persona o no está disponible, el formulario habilita el ingreso manual.

## 1. Aplicar la base de datos

En una base existente ejecuta una sola vez:

`supabase/migrations/20261006000000_dni_lookup_foundation.sql`

En una base nueva ejecuta `supabase/sql/06_dni_lookup_foundation.sql` después del SQL `05`. No ejecutes ambos archivos sobre la misma base porque contienen la misma instalación.

Se crean:

- `dni_lookup_rate_limits`: contadores por ventanas de un minuto.
- `dni_lookup_attempts`: diagnóstico sin guardar el DNI ni la dirección IP en texto legible.
- `consume_dni_lookup_rate_limit`: consumo atómico, incluso con solicitudes simultáneas.

Los límites son 10 consultas externas por usuario y 30 por origen durante cada minuto. Las búsquedas resueltas en `clients` no consumen el límite.

## 2. Configurar secretos

Genera un secreto de hash diferente de los secretos del correo:

```bash
openssl rand -hex 32
```

Configura las variables desde un archivo local que no se suba a Git:

```env
DNI_API_BASE_URL=https://TU_PROVEEDOR/ruta
# Opcional: no la configures si el proveedor es público.
DNI_API_BEARER_TOKEN=TU_TOKEN_BEARER_PRIVADO
DNI_LOOKUP_HASH_SECRET=VALOR_ALEATORIO_DE_32_BYTES
DNI_API_TIMEOUT_MS=15000
DNI_LOOKUP_DEBUG=false
```

Luego ejecuta:

```bash
supabase secrets set --env-file ./ruta/a/tu-archivo.env
```

La URL debe terminar justo antes del DNI. La función realizará `GET <DNI_API_BASE_URL>/<DNI>`. Solo enviará `Authorization: Bearer ...` cuando `DNI_API_BEARER_TOKEN` esté configurado.

El adaptador acepta el contrato protegido actual:

```json
{
  "success": true,
  "dni": "12345678",
  "nombres": "JOSE LIS",
  "apellidoPaterno": "UCA",
  "apellidoMaterno": "UMA",
  "codVerifica": 9,
  "codVerificaLetra": "C"
}
```

Una respuesta `{"success":false,"message":"..."}` habilita el ingreso manual; si el mensaje indica que no se encontró información se clasifica como `NOT_FOUND`, y los demás mensajes como error del proveedor. También se conserva compatibilidad con las propiedades anteriores `numero`, `apellido_paterno` y `apellido_materno`.

## 3. Desplegar

Desde la raíz del repositorio:

```bash
supabase functions deploy dni-lookup
```

No uses `--no-verify-jwt`: la función requiere la sesión del trabajador y además vuelve a validarla antes de consultar el proveedor.

## 4. Comportamiento esperado

- Cliente local: carga sus datos sin llamar al proveedor.
- DNI externo encontrado: carga nombres y apellidos, pero permite revisarlos antes de guardar.
- No encontrado, proveedor caído o tiempo agotado: informa el motivo y permite ingreso manual.
- Límite alcanzado: muestra cuánto falta para volver a consultar y permite ingreso manual.
- Respuesta cuyo `numero` no coincide con el DNI solicitado: no autocompleta y registra `INVALID_RESPONSE`.

La función aplica por defecto un tiempo máximo de quince segundos, configurable con `DNI_API_TIMEOUT_MS` entre 3000 y 30000 milisegundos. Solo repite una vez las respuestas HTTP 502, 503 o 504. No registra el DNI completo, el token, la URL privada ni la IP: usa hashes HMAC no reversibles para diagnóstico y control.

## 5. Verificación

Ejecuta `supabase/tests/verify_dni_lookup_foundation.sql` en SQL Editor. Todas las filas deben mostrar `passed = true`.

Puedes revisar resultados agregados sin exponer documentos:

```sql
select outcome, count(*) as total
from public.dni_lookup_attempts
group by outcome
order by outcome;
```

Después prueba desde **Nueva atención** un DNI ya registrado, uno válido disponible en el proveedor, uno inexistente y once documentos no registrados durante el mismo minuto.

## 6. Diagnóstico temporal del proveedor

Para confirmar la solicitud saliente sin registrar el DNI ni el token reutilizable:

```bash
supabase secrets set DNI_LOOKUP_DEBUG=true
supabase functions deploy dni-lookup
```

Los logs mostrarán el método `GET`, el endpoint con `********` en lugar del DNI, `Accept`, el tiempo máximo y los primeros 16 caracteres de la huella SHA-256 del Bearer. Al terminar desactívalo:

```bash
supabase secrets set DNI_LOOKUP_DEBUG=false
```
