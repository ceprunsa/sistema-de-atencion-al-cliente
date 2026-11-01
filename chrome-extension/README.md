# Extensión Chrome RAC

La extensión usa Manifest V3 y lee únicamente mensajes expandidos en Gmail. No
utiliza Gmail API, OAuth ni descarga adjuntos. Exige un mensaje recibido, una
respuesta final posterior, marcas temporales numéricas e identidades verificadas.

La precarga vive en `chrome.storage.session` y se elimina al guardar, cancelar,
cerrar la pestaña, reiniciar Chrome o vencer 30 minutos.

## Requisitos

Aplica primero el SQL 16 y después uno de estos archivos, no ambos:

- Base nueva: `supabase/sql/17_gmail_answered_exchange.sql`.
- Base existente: ejecuta
  `supabase/migrations/20261031000000_gmail_answered_exchange.sql` y luego
  `supabase/migrations/20261101000000_remove_delegate_name.sql`.

## Generar ambas versiones

```powershell
npm run build:extension
```

Se generan carpetas listas para cargar:

- `dist/chrome-extension-local`
- `dist/chrome-extension-production`

También puedes ejecutar `npm run build:extension:local` o
`npm run build:extension:production`.

La versión local abre exclusivamente
`http://localhost:4000/attentions/new`, muestra el distintivo rojo **DEV** y
nunca entrega datos a producción. Inicia Vite con:

```powershell
npm run dev -- --host localhost --port 4000 --strictPort
```

Producción abre exclusivamente
`https://sistema-de-atencion-al-cliente.vercel.app/attentions/new` y no
ejecuta el puente en localhost.

## Cargar en Chrome

1. Abre `chrome://extensions`.
2. Activa **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida**.
4. Selecciona una de las dos carpetas generadas.
5. Recarga Gmail.

No cargues directamente `chrome-extension/` en pruebas operativas: contiene
el código fuente y ambos manifests.

## Uso

1. Expande el mensaje recibido y la respuesta final.
2. Pulsa **Seleccionar intercambio**.
3. Marca la consulta recibida y la respuesta final.
4. Confirma la identidad del buzón.
5. Si es delegado, confirma también la identidad personal.
6. Pulsa **Importar intercambio**.
7. Revisa y guarda mediante el formulario RAC.

Los textos pueden corregirse. Las fechas se muestran en `America/Lima` y no se
pueden editar porque proceden de marcas exactas del encabezado Gmail. La URL de
la conversación es solo una referencia: requiere acceso al buzón y puede cambiar
en cuentas delegadas.

Los selectores están centralizados en `content/gmail-adapter.js`. Ante un
cambio de Gmail, la extensión bloquea la importación en vez de inventar datos.

Consulta la matriz completa en [TESTING.md](TESTING.md).

