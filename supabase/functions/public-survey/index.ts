// Endpoint publico para consultar y responder encuestas enviadas por correo.
// Desplegar con --no-verify-jwt. La service role nunca se expone al navegador.
// @ts-ignore: Supabase Edge Runtime resuelve paquetes npm al desplegar.
import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (request: Request) => Response | Promise<Response>) => void;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESPONSES = new Set(["VERY_SATISFIED", "SATISFIED", "DISSATISFIED", "VERY_DISSATISFIED"]);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extraHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

const hmacHex = async (secret: string, value: string) => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const sourceAddress = (request: Request) =>
  (request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown").slice(0, 128);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED", message: "Método no permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const hashSecret = Deno.env.get("PUBLIC_SURVEY_HASH_SECRET")?.trim();
  if (!supabaseUrl || !serviceRoleKey || !hashSecret) {
    return json({ code: "SERVICE_NOT_CONFIGURED", message: "El servicio de encuestas no está configurado." }, 500);
  }

  let body: { action?: unknown; token?: unknown; response?: unknown; skip?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return json({ code: "INVALID_REQUEST", message: "El cuerpo de la solicitud no es válido." }, 400);
  }

  const action = typeof body.action === "string" ? body.action : "";
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!UUID_PATTERN.test(token) || !["get", "respond"].includes(action)) {
    return json({ code: "INVALID_REQUEST", message: "La solicitud no es válida." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const originHash = await hmacHex(hashSecret, `origin:${sourceAddress(request)}`);
  const tokenHash = await hmacHex(hashSecret, `token:${token}`);
  const { data: limits, error: limitError } = await admin.rpc("consume_public_survey_rate_limit", {
    p_origin_hash: originHash,
    p_token_hash: tokenHash,
  });
  if (limitError || !limits?.[0]) {
    console.error("public-survey:rate-limit-failed", { code: limitError?.code });
    return json({ code: "RATE_LIMIT_ERROR", message: "No se pudo comprobar el límite de solicitudes." }, 500);
  }
  const limit = limits[0] as { allowed: boolean; retry_after_seconds: number };
  if (!limit.allowed) {
    return json(
      { code: "RATE_LIMITED", message: "Se alcanzó el límite de solicitudes. Intenta nuevamente en un momento." },
      429,
      { "Retry-After": String(limit.retry_after_seconds) },
    );
  }

  if (action === "get") {
    const { data, error } = await admin.rpc("get_public_attention_survey", { p_token: token });
    if (error) {
      console.error("public-survey:get-failed", { code: error.code });
      return json({ code: "QUERY_ERROR", message: "No se pudo consultar la encuesta." }, 500);
    }
    const attentionSurvey = data as { state?: string } | null;
    if (attentionSurvey?.state !== "INVALID") return json(attentionSurvey as Record<string, unknown>);

    const { data: referralData, error: referralError } = await admin.rpc("get_public_referral_survey", { p_token: token });
    if (referralError) {
      console.error("public-survey:get-referral-failed", { code: referralError.code });
      return json({ code: "QUERY_ERROR", message: "No se pudo consultar la encuesta." }, 500);
    }
    return json(referralData as Record<string, unknown>);
  }

  const skip = body.skip === true;
  const response = typeof body.response === "string" ? body.response : null;
  if (!skip && (!response || !RESPONSES.has(response))) {
    return json({ code: "INVALID_RESPONSE", message: "Selecciona una respuesta válida." }, 400);
  }
  const { data, error } = await admin.rpc("respond_public_attention_survey", {
    p_token: token,
    p_response: skip ? null : response,
    p_skip: skip,
  });
  if (error) {
    console.error("public-survey:respond-failed", { code: error.code });
    return json({ code: "SAVE_ERROR", message: "No se pudo guardar la respuesta." }, 500);
  }
  const attentionResult = data as { result?: string } | null;
  if (attentionResult?.result !== "INVALID") return json(attentionResult as Record<string, unknown>);

  const { data: referralData, error: referralError } = await admin.rpc("respond_public_referral_survey", {
    p_token: token,
    p_response: skip ? null : response,
    p_skip: skip,
  });
  if (referralError) {
    console.error("public-survey:respond-referral-failed", { code: referralError.code });
    return json({ code: "SAVE_ERROR", message: "No se pudo guardar la respuesta." }, 500);
  }
  return json(referralData as Record<string, unknown>);
});
