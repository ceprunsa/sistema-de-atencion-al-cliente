# Verificacion integral del listado y exportacion RAC

## Preparacion

1. Ejecutar `supabase/sql/27_attention_listing_filters.sql` si aun no esta instalado.
2. Ejecutar `supabase/sql/28_attention_exports.sql` si aun no esta instalado.
3. En bases existentes, ejecutar `supabase/sql/29_fix_attention_export_pgcrypto_search_path.sql`.
4. Desplegar `supabase functions deploy attention-export`.
5. Ejecutar `supabase/tests/verify_attention_listing_exports_end_to_end.sql`.

## Listado y filtros

- Buscar por codigo RAC, DNI, nombre y correo.
- Combinar busqueda con encuesta, derivacion, proceso, medio y mesa.
- Como administrador, combinar tambien el area destino.
- Confirmar que medios y mesas inhabilitados con historial aparecen identificados.
- Cambiar un filtro desde una pagina intermedia y confirmar el retorno a pagina 1.
- Abrir el detalle, usar “Volver a atenciones” y confirmar busqueda, filtros, limite y pagina.
- Probar una pagina guardada que ya no exista y confirmar el ajuste a la ultima valida.

## Paginacion

- Con hasta 10 paginas, confirmar que se muestran todas.
- Con 20 paginas y pagina 1: `1 2 3 4 5 … 16 17 18 19 20`.
- Con 20 paginas y pagina 10: `1 2 3 4 5 … 8 9 10 11 12 … 16 17 18 19 20`.
- Con 20 paginas y pagina 20: `1 2 3 4 5 … 16 17 18 19 20`.
- Confirmar anterior, siguiente, extremos, “Ir a” y cambio de filas.
- Revisar tambien clientes, quejas, usuarios y derivaciones porque comparten el componente.

## Exportacion como administrador

- Exportar todas las atenciones y confirmar que incluye activas e inhabilitadas.
- Exportar con filtros y confirmar que contiene todos los resultados, no solo la pagina visible.
- Exportar un rango y validar ambos dias completos en horario `America/Lima`.
- Combinar rango y filtros, verificando el aviso mostrado por la interfaz.

## Exportacion como usuario

- Confirmar que “Todas mis atenciones” contiene solamente RAC activos creados por ese usuario.
- Aplicar filtros que en el listado muestran RAC ajenos y confirmar que el Excel no los incluye.
- Intentar manipular los UUID enviados y confirmar rechazo o alcance limitado en Supabase.

## Archivo y trabajos

- Confirmar columnas de cliente, medio, mesa, registrador, tipos, temas, conclusion, encuesta y derivacion.
- Confirmar valores multiples separados de forma legible.
- Cerrar el modal durante la preparacion y comprobar que el trabajo continua.
- Descargar un trabajo completado y comprobar que el enlace es temporal.
- Forzar un fallo controlado y probar reintento hasta el maximo de tres intentos.
- Confirmar que una solicitud equivalente en curso no crea un trabajo duplicado.
- Confirmar que un archivo vencido ya no se descarga.
- Retirar temporalmente el rol ADMIN y confirmar que no descarga una exportacion global anterior.
