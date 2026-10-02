# Sistema de Atención al Cliente CEPRUNSA

Aplicación Vite + React + TypeScript conectada a Supabase. Incluye usuarios e invitaciones, áreas, medios de atención, registro RAC, derivaciones por área, mesas de trabajo y encuestas presenciales mediante tablet.

## Desarrollo

```bash
npm install
npm run dev
```

Variables requeridas en `.env`:

```env
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA
```

## Verificación

```bash
npm run verify
```

## Base nueva desde cero

Ejecuta en SQL Editor, en este orden:

1. `supabase/sql/01_setup.sql`
2. `supabase/sql/03_customer_service.sql`
3. `supabase/sql/04_workstations_surveys_referral_inbox.sql`
4. Configura y ejecuta `supabase/sql/02_bootstrap_admin.sql` antes del primer ingreso.

Después configura el hook de invitaciones, OAuth y Realtime siguiendo `SUPABASE_WORKSTATIONS_SETUP.md`.

## Base existente

Si la base ya tiene instalados los módulos anteriores, ejecuta una sola vez:

`supabase/migrations/20261002000000_workstations_surveys_referral_inbox.sql`

No ejecutes simultáneamente el archivo de migración y el SQL `04`: contienen la misma ampliación.
