// Consulta DNI protegida. Los secretos del proveedor solo existen en Edge Functions.
// @ts-ignore: Supabase Edge Runtime resuelve el paquete npm al desplegar.
import { createClient } from "npm:@supabase/supabase-js@2";
import { DniProviderError, lookupDniAtProvider } from "./provider.ts";

declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (request: Request) => Response | Promise<Response>) => void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extraHeaders, "Content-Type": "application/json" },
  });

const hmacHex = async (secret: string, value: string) => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const getSourceAddress = (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (request.headers.get("cf-connecting-ip") || forwarded || "unknown").slice(0, 128);
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED", message: "Método no permitido." }, 405);

  const startedAt = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const providerUrl = Deno.env.get("DNI_API_BASE_URL")?.trim();
  const providerToken = Deno.env.get("DNI_API_BEARER_TOKEN")?.trim() || undefined;
  const hashSecret = Deno.env.get("DNI_LOOKUP_HASH_SECRET")?.trim();
  const debugProviderRequest = Deno.env.get("DNI_LOOKUP_DEBUG")?.trim().toLowerCase() === "true";
  const configuredTimeout = Number(Deno.env.get("DNI_API_TIMEOUT_MS") || "15000");
  const providerTimeoutMs = Number.isInteger(configuredTimeout)
    ? Math.min(30000, Math.max(3000, configuredTimeout))
    : 15000;
  if (!supabaseUrl || !serviceRoleKey || !providerUrl || !hashSecret) {
    return json({ code: "SERVICE_NOT_CONFIGURED", message: "El servicio de consulta DNI no está configurado." }, 500);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ code: "UNAUTHORIZED", message: "No se recibió una sesión válida." }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: userError } = await admin.auth.getUser(authorization.slice("Bearer ".length));
  if (userError || !user) return json({ code: "UNAUTHORIZED", message: "La sesión no es válida o expiró." }, 401);

  const { data: profile, error: profileError } = await admin.from("profiles").select("id,status").eq("id", user.id).eq("status", "active").maybeSingle();
  if (profileError) return json({ code: "AUTHORIZATION_ERROR", message: "No se pudo comprobar el acceso al servicio." }, 500);
  if (!profile) return json({ code: "FORBIDDEN", message: "Tu usuario no está activo." }, 403);

  let payload: { dni?: unknown };
  try {
    payload = await request.json() as { dni?: unknown };
  } catch {
    return json({ code: "INVALID_REQUEST", message: "El cuerpo de la solicitud no es válido." }, 400);
  }
  const dni = typeof payload.dni === "string" ? payload.dni.trim() : "";
  if (!/^\d{8}$/.test(dni)) return json({ code: "INVALID_DNI", message: "El DNI debe contener exactamente 8 dígitos." }, 400);

  const { data: localClient, error: localError } = await admin
    .from("clients")
    .select("id,dni,first_name,middle_name,paternal_surname,maternal_surname,email,phone,created_at,updated_at")
    .eq("dni", dni)
    .maybeSingle();
  if (localError) return json({ code: "LOCAL_LOOKUP_ERROR", message: "No se pudo consultar la base de clientes." }, 500);
  if (localClient) return json({ status: "FOUND", source: "LOCAL", client: localClient });

  const originHash = await hmacHex(hashSecret, `origin:${getSourceAddress(request)}`);
  const documentHash = await hmacHex(hashSecret, `dni:${dni}`);
  const audit = async (outcome: string, providerStatus: number | null = null) => {
    const { error } = await admin.from("dni_lookup_attempts").insert({
      user_id: user.id, origin_hash: originHash, document_hash: documentHash,
      outcome, provider_status: providerStatus, duration_ms: Date.now() - startedAt,
    });
    if (error) console.error("dni-lookup:audit-failed", { code: error.code });
  };

  const { data: limits, error: limitError } = await admin.rpc("consume_dni_lookup_rate_limit", { p_user_id: user.id, p_origin_hash: originHash });
  if (limitError || !limits?.[0]) {
    console.error("dni-lookup:rate-limit-failed", { code: limitError?.code });
    return json({ code: "RATE_LIMIT_ERROR", message: "No se pudo comprobar el límite de consultas." }, 500);
  }
  const limit = limits[0] as { allowed: boolean; retry_after_seconds: number };
  if (!limit.allowed) {
    await audit("RATE_LIMITED");
    return json(
      { code: "RATE_LIMITED", message: `Se alcanzó el límite de consultas. Intenta nuevamente en ${limit.retry_after_seconds} segundos.`, retryAfterSeconds: limit.retry_after_seconds },
      429,
      { "Retry-After": String(limit.retry_after_seconds) },
    );
  }

  try {
    if (debugProviderRequest) {
      const endpoint = `${providerUrl.replace(/\/+$/, "")}/${dni}`;
      console.info("dni-lookup:provider-request", {
        method: "GET",
        endpoint: endpoint.replace(dni, "********"),
        accept: "application/json",
        authorization: providerToken
          ? `Bearer [sha256:${(await sha256Hex(providerToken)).slice(0, 16)}]`
          : "none",
        timeoutMs: providerTimeoutMs,
      });
    }
    const result = await lookupDniAtProvider({
      baseUrl: providerUrl,
      bearerToken: providerToken,
      dni,
      timeoutMs: providerTimeoutMs,
    });
    if (result.status === "NOT_FOUND") {
      await audit("NOT_FOUND", result.providerStatus);
      return json({ status: "NOT_FOUND", message: "El DNI no fue encontrado. Ingresa los datos manualmente." });
    }
    await audit("FOUND", result.providerStatus);
    return json({ status: "FOUND", source: "EXTERNAL", person: result.person });
  } catch (error) {
    const providerError = error instanceof DniProviderError
      ? error
      : new DniProviderError("No se pudo completar la consulta externa.", "PROVIDER_ERROR", null);
    await audit(providerError.code, providerError.providerStatus);
    console.error("dni-lookup:provider-failed", { code: providerError.code, status: providerError.providerStatus });
    return json({ status: "UNAVAILABLE", code: providerError.code, message: `${providerError.message} Ingresa los datos manualmente.` });
  }
});
