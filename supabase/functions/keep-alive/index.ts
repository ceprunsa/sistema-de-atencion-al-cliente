// Se ejecuta en Supabase Edge Runtime (Deno), no en Vite/Node.
// @ts-ignore: Supabase Edge Runtime resuelve el paquete npm al desplegar.
import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (
    handler: (request: Request) => Response | Promise<Response>,
  ) => void;
};

const json = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Método no permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const expectedSecret = Deno.env.get("KEEP_ALIVE_SECRET");
  const receivedSecret = request.headers.get("x-keep-alive-secret");

  if (!supabaseUrl || !serviceRoleKey || !expectedSecret) {
    return json({ error: "La función no está configurada." }, 500);
  }

  if (!receivedSecret || receivedSecret !== expectedSecret) {
    return json({ error: "Solicitud no autorizada." }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Fuerza una consulta real y mínima a PostgreSQL sin modificar información.
  const { error } = await admin.from("roles").select("id").limit(1);

  if (error) {
    console.error("Falló la consulta keep-alive:", error);
    return json({ error: "No se pudo consultar la base de datos." }, 500);
  }

  return json({ success: true, checkedAt: new Date().toISOString() }, 200);
});
