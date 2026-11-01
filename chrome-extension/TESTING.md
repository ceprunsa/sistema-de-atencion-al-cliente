# Pruebas de aceptación Gmail–RAC

## Preparación

1. En una base nueva aplica SQL 16 y SQL 17. En una base existente aplica también la migración que elimina el nombre delegado.
2. Ejecuta `npm run verify`.
3. Para local, inicia Vite en `http://localhost:4000`.
4. Verifica un medio activo EMAIL, perfil activo y mesa asignada.
5. Carga `dist/chrome-extension-local` o
   `dist/chrome-extension-production` y recarga Gmail.

## Intercambio

- Expande al menos dos mensajes.
- El botón **Seleccionar intercambio** no debe duplicarse.
- Selecciona mensajes distintos como recibido y respuesta.
- Un borrador debe estar identificado y bloqueado.
- Una respuesta anterior o igual debe rechazarse.
- En hilos con varios intercambios, selecciona manualmente el par correcto.
- El mensaje recibido debe llegar como consulta y la respuesta como conclusión.

## Fechas

Prueba mensajes de hoy, mostrados como “ayer”, de meses y años anteriores, con
Gmail en español e inglés y con el navegador en otra zona horaria.

El resultado debe mostrarse en `America/Lima`. Se acepta `data-time`, un
`datetime` con zona o una fecha completa visible en Gmail. Si falta una fecha
exacta, la importación debe bloquearse. No se interpretan textos relativos.

## Identidades

- Buzón normal: el correo debe coincidir con el remitente visible.
- Buzón delegado: son obligatorios el buzón y el delegado.
- Si falta una identidad, la importación debe bloquearse.
- Prueba respuestas desde alias y remitentes diferentes.

## Formulario y Supabase

- El recibido aparece como mensaje original.
- La respuesta aparece como conclusión y respuesta original.
- Ambas fechas son obligatorias, posteriores y de solo lectura.
- El detalle muestra buzón, delegado, fuentes y enlace Gmail.
- Supabase rechaza una importación v2 incompleta.
- Atenciones web e importaciones históricas siguen funcionando.

## Duplicados

- Reimportar el par advierte coincidencia del intercambio.
- Reutilizar solo recibido o respuesta produce su advertencia.
- Cancelar no crea datos.
- **Registrar de todas formas** permite un RAC independiente.

## Seguridad y aislamiento

- La URL RAC no contiene datos personales.
- Cancelar, guardar, cerrar o esperar 30 minutos elimina la precarga.
- Dos pestañas no mezclan importaciones.
- Local nunca abre Vercel y producción nunca abre localhost.
- No se descargan adjuntos ni se ejecuta HTML del correo.

Si Gmail cambia su DOM, revisa `content/gmail-adapter.js`. La conducta segura
es bloquear la importación y mantener disponible el formulario manual.

