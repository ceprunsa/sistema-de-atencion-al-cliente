// Este archivo se ejecuta en Supabase Edge Runtime (Deno), no en Vite/Node.
// @ts-ignore: Supabase Edge Runtime resuelve el paquete npm al desplegar.
import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (
    handler: (request: Request) => Response | Promise<Response>,
  ) => void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Método no permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "La función no tiene configuración de Supabase." }, 500);
  }

  if (!authorization?.startsWith("Bearer ")) {
    return json({ error: "No se recibió una sesión válida." }, 401);
  }

  const accessToken = authorization.slice("Bearer ".length);
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user: caller },
    error: callerError,
  } = await admin.auth.getUser(accessToken);

  if (callerError || !caller) {
    return json({ error: "La sesión del solicitante no es válida." }, 401);
  }

  let payload: { userId?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "El cuerpo de la solicitud no es válido." }, 400);
  }

  const userId = payload.userId?.trim();
  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return json({ error: "El identificador del usuario no es válido." }, 400);
  }

  if (userId === caller.id) {
    return json({ error: "No puedes eliminar tu propia cuenta." }, 409);
  }

  const { data: adminRole, error: roleError } = await admin
    .from("user_roles")
    .select("role:roles!inner(key)")
    .eq("user_id", caller.id)
    .eq("roles.key", "ADMIN")
    .maybeSingle();

  if (roleError) {
    console.error("No se pudo verificar el rol:", roleError);
    return json({ error: "No se pudo verificar la autorización." }, 500);
  }

  if (!adminRole) {
    return json({ error: "Solo un administrador puede eliminar usuarios." }, 403);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId, false);

  if (deleteError) {
    console.error("No se pudo eliminar el usuario:", deleteError);
    const ownsStorageObjects = deleteError.message.toLowerCase().includes("storage");
    return json(
      {
        error: ownsStorageObjects
          ? "El usuario posee archivos en Storage. Elimínalos o reasígnalos antes de borrar la cuenta."
          : "No se pudo eliminar el usuario de Supabase Auth.",
      },
      ownsStorageObjects ? 409 : 500,
    );
  }

  return json({ success: true, userId }, 200);
});
