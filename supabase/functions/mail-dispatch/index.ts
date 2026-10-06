// Worker privado de correo. Desplegar con --no-verify-jwt y proteger con
// MAIL_DISPATCH_SECRET; nunca debe ser invocado directamente desde React.
// @ts-ignore: Supabase Edge Runtime resuelve paquetes npm al desplegar.
import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (request: Request) => Response | Promise<Response>) => void;
};

type OutboxJob = {
  id: string;
  event_type: "REFERRAL_CREATED" | "ATTENTION_SURVEY" | "REFERRAL_RESOLVED";
  aggregate_type: "ATTENTION" | "REFERRAL";
  aggregate_id: string;
  recipient_email: string;
  cc_emails: string[];
  template_key: "REFERRAL_CREATED" | "ATTENTION_SURVEY" | "REFERRAL_RESOLVED";
  template_data: Record<string, unknown>;
  encrypted_payload: string | null;
  idempotency_key: string;
  attempt_count: number;
};

type RenderedEmail = { subject: string; htmlBody: string; textBody: string };
type AppsScriptResponse = {
  ok?: boolean;
  code?: string;
  message?: string;
  acceptedAt?: string;
  duplicate?: boolean;
  retryable?: boolean;
  retryAfterSeconds?: number;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RETRY_DELAYS_SECONDS = [60, 300, 1_800, 7_200, 43_200];

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

const secureEquals = (left: string, right: string) => {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    difference |= (a[index] || 0) ^ (b[index] || 0);
  }
  return difference === 0;
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const isValidEmail = (value: string) => {
  const normalized = normalizeEmail(value);
  return normalized.length <= 254 && EMAIL_PATTERN.test(normalized);
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] || character);

const requireText = (data: Record<string, unknown>, key: string, maxLength: number) => {
  const value = data[key];
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new Error(`TEMPLATE_DATA_INVALID:${key}`);
  }
  return value.trim();
};

const requireUuid = (data: Record<string, unknown>, key: string) => {
  const value = requireText(data, key, 36);
  if (!UUID_PATTERN.test(value)) throw new Error(`TEMPLATE_DATA_INVALID:${key}`);
  return value;
};

const baseLayout = (title: string, content: string) => `<!doctype html>
<html lang="es"><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:12px;border:1px solid #e5e7eb">
<tr><td style="padding:28px"><h1 style="margin:0 0 18px;color:#1A2855;font-size:22px">${escapeHtml(title)}</h1>${content}
<p style="margin:28px 0 0;color:#6b7280;font-size:12px">Mensaje autom&aacute;tico del Sistema de Registro de Atenci&oacute;n al Cliente.</p>
</td></tr></table></td></tr></table></body></html>`;

const actionButton = (url: string, label: string) =>
  `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#1A2855;color:#fff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:600">${escapeHtml(label)}</a></p>`;

const renderEmail = (job: OutboxJob, publicAppUrl: string): RenderedEmail => {
  const data = job.template_data || {};
  const racCode = requireText(data, "racCode", 40);

  if (job.template_key === "REFERRAL_CREATED") {
    const attentionId = requireUuid(data, "attentionId");
    const areaName = requireText(data, "destinationAreaName", 120);
    const detailUrl = `${publicAppUrl}/attentions/${attentionId}`;
    return {
      subject: `Nueva derivación pendiente · ${racCode}`,
      htmlBody: baseLayout("Nueva derivación pendiente", `<p>Se registr&oacute; una derivaci&oacute;n para el &aacute;rea <strong>${escapeHtml(areaName)}</strong>.</p><p>C&oacute;digo de atenci&oacute;n: <strong>${escapeHtml(racCode)}</strong></p>${actionButton(detailUrl, "Abrir atención")}`),
      textBody: `Nueva derivación pendiente\n\nÁrea: ${areaName}\nCódigo: ${racCode}\nAbrir: ${detailUrl}`,
    };
  }

  const surveyToken = requireText(data, "surveyToken", 500);
  const surveyUrl = `${publicAppUrl}/survey/${encodeURIComponent(surveyToken)}`;
  if (job.template_key === "ATTENTION_SURVEY") {
    return {
      subject: `Encuesta de satisfacción · ${racCode}`,
      htmlBody: baseLayout("Encuesta de satisfacción", `<p>Queremos conocer tu opini&oacute;n sobre la atenci&oacute;n recibida.</p><p>C&oacute;digo: <strong>${escapeHtml(racCode)}</strong></p>${actionButton(surveyUrl, "Responder encuesta")}<p style="color:#6b7280;font-size:13px">El enlace es personal y tiene una vigencia limitada. No lo compartas.</p>`),
      textBody: `Encuesta de satisfacción\n\nCódigo: ${racCode}\nResponder: ${surveyUrl}\n\nEl enlace es personal y tiene una vigencia limitada.`,
    };
  }

  const conclusion = requireText(data, "conclusion", 3_000);
  return {
    subject: `Resultado de derivación · ${racCode}`,
    htmlBody: baseLayout("Resultado de tu derivación", `<p>C&oacute;digo: <strong>${escapeHtml(racCode)}</strong></p><p style="white-space:pre-wrap">${escapeHtml(conclusion)}</p>${actionButton(surveyUrl, "Responder encuesta")}<p style="color:#6b7280;font-size:13px">El enlace es personal y tiene una vigencia limitada. No lo compartas.</p>`),
    textBody: `Resultado de tu derivación\n\nCódigo: ${racCode}\n\n${conclusion}\n\nResponder encuesta: ${surveyUrl}`,
  };
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const sign = async (value: string, secret: string) => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
};

const callAppsScript = async (job: OutboxJob, email: RenderedEmail, appsScriptUrl: string, hmacSecret: string, fromName: string) => {
  const payload = {
    to: normalizeEmail(job.recipient_email),
    cc: job.cc_emails.map(normalizeEmail),
    subject: email.subject,
    htmlBody: email.htmlBody,
    textBody: email.textBody,
    fromName,
  };
  const payloadBase64 = bytesToBase64(new TextEncoder().encode(JSON.stringify(payload)));
  const version = 1;
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();
  const canonical = `${version}.${timestamp}.${nonce}.${job.id}.${payloadBase64}`;
  const signature = await sign(canonical, hmacSecret);
  const response = await fetch(appsScriptUrl, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version, timestamp, nonce, messageId: job.id, payload: payloadBase64, signature }),
    signal: AbortSignal.timeout(12_000),
  });
  const responseText = await response.text();
  try {
    return { response, result: JSON.parse(responseText) as AppsScriptResponse };
  } catch {
    throw new Error(`APPS_SCRIPT_INVALID_RESPONSE:${response.status}`);
  }
};

const nextRetryAt = (attempt: number, requestedSeconds?: number) => {
  const fallback = RETRY_DELAYS_SECONDS[Math.min(Math.max(attempt - 1, 0), RETRY_DELAYS_SECONDS.length - 1)];
  const seconds = Math.max(30, Math.min(requestedSeconds || fallback, 86_400));
  return new Date(Date.now() + seconds * 1000).toISOString();
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const dispatchSecret = Deno.env.get("MAIL_DISPATCH_SECRET");
  const appsScriptUrl = Deno.env.get("APPS_SCRIPT_URL");
  const hmacSecret = Deno.env.get("APPS_SCRIPT_HMAC_SECRET");
  const publicAppUrl = Deno.env.get("PUBLIC_APP_URL")?.replace(/\/$/, "");
  const fromName = Deno.env.get("MAIL_FROM_NAME")?.trim() || "Atención al Cliente";
  if (!supabaseUrl || !serviceRoleKey || !dispatchSecret || !appsScriptUrl || !hmacSecret || !publicAppUrl) {
    return json({ error: "El servicio de correo no está configurado." }, 500);
  }

  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ") || !secureEquals(authorization.slice(7), dispatchSecret)) {
    return json({ error: "No autorizado." }, 401);
  }

  let requestedLimit = 20;
  try {
    const body = await request.json() as { limit?: unknown };
    if (typeof body.limit === "number" && Number.isInteger(body.limit)) requestedLimit = Math.max(1, Math.min(body.limit, 50));
  } catch { /* El cuerpo es opcional. */ }

  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const workerId = crypto.randomUUID();
  const { data, error } = await client.rpc("claim_email_outbox_batch", { p_worker_id: workerId, p_limit: requestedLimit });
  if (error) {
    console.error("mail-dispatch:claim-failed", { code: error.code });
    return json({ error: "No se pudo reclamar la bandeja de salida." }, 500);
  }

  const jobs = (data || []) as OutboxJob[];
  const summary = { claimed: jobs.length, sent: 0, retry: 0, permanentFailure: 0 };
  for (const job of jobs) {
    const startedAt = Date.now();
    const finish = async (values: {
      outcome: "SENT" | "FAILED_RETRYABLE" | "FAILED_PERMANENT";
      providerCode?: string; errorCode?: string; errorMessage?: string;
      acceptedAt?: string; nextAttemptAt?: string;
    }) => {
      const { error: finishError } = await client.rpc("finish_email_outbox_attempt", {
        p_outbox_id: job.id,
        p_worker_id: workerId,
        p_outcome: values.outcome,
        p_provider_response_code: values.providerCode || null,
        p_error_code: values.errorCode || null,
        p_error_message: values.errorMessage || null,
        p_accepted_at: values.acceptedAt || null,
        p_provider_message_id: values.outcome === "SENT" ? job.id : null,
        p_next_attempt_at: values.nextAttemptAt || null,
        p_duration_ms: Date.now() - startedAt,
      });
      if (finishError) console.error("mail-dispatch:finish-failed", { jobId: job.id, code: finishError.code });
    };

    const ccEmails = [...new Set(job.cc_emails.map(normalizeEmail))].filter((email) => email !== normalizeEmail(job.recipient_email));
    if (!isValidEmail(job.recipient_email) || ccEmails.some((email) => !isValidEmail(email))) {
      await finish({ outcome: "FAILED_PERMANENT", errorCode: "INVALID_RECIPIENT", errorMessage: "El correo destinatario registrado no es válido." });
      summary.permanentFailure += 1;
      continue;
    }
    job.cc_emails = ccEmails;

    try {
      if (job.template_key === "REFERRAL_CREATED") {
        const recipientProfileId = requireUuid(job.template_data || {}, "recipientProfileId");
        const { data: referral, error: referralError } = await client
          .from("attention_referrals")
          .select("attention_id,destination_area_id,status")
          .eq("id", job.aggregate_id)
          .maybeSingle();
        if (referralError) throw new Error("SOURCE_VALIDATION_TRANSIENT:REFERRAL");

        const { data: recipient, error: recipientError } = await client
          .from("profiles")
          .select("area_id,email,status")
          .eq("id", recipientProfileId)
          .maybeSingle();
        if (recipientError) throw new Error("SOURCE_VALIDATION_TRANSIENT:RECIPIENT");

        let attentionIsActive = false;
        if (referral) {
          const { data: attention, error: attentionError } = await client
            .from("customer_attentions")
            .select("status")
            .eq("id", referral.attention_id)
            .maybeSingle();
          if (attentionError) throw new Error("SOURCE_VALIDATION_TRANSIENT:ATTENTION");
          attentionIsActive = attention?.status === "ACTIVE";
        }

        const sourceIsValid = referral?.status === "PENDING"
          && attentionIsActive
          && recipient?.status === "active"
          && recipient.area_id === referral.destination_area_id
          && normalizeEmail(recipient.email || "") === normalizeEmail(job.recipient_email);
        if (!sourceIsValid) {
          await finish({
            outcome: "FAILED_PERMANENT",
            errorCode: "SOURCE_NO_LONGER_VALID",
            errorMessage: "La derivación o el destinatario ya no cumple las condiciones del aviso.",
          });
          summary.permanentFailure += 1;
          continue;
        }
      } else if (job.template_key === "ATTENTION_SURVEY") {
        const surveyId = requireUuid(job.template_data || {}, "surveyId");
        const surveyToken = requireUuid(job.template_data || {}, "surveyToken");
        const { data: survey, error: surveyError } = await client
          .from("attention_surveys")
          .select("attention_id,channel,status,recipient_email,survey_token,email_outbox_id")
          .eq("id", surveyId)
          .maybeSingle();
        if (surveyError) throw new Error("SOURCE_VALIDATION_TRANSIENT:SURVEY");

        let attentionIsActive = false;
        if (survey) {
          const { data: attention, error: attentionError } = await client
            .from("customer_attentions")
            .select("status")
            .eq("id", survey.attention_id)
            .maybeSingle();
          if (attentionError) throw new Error("SOURCE_VALIDATION_TRANSIENT:ATTENTION");
          attentionIsActive = attention?.status === "ACTIVE";
        }

        const sourceIsValid = survey?.status === "QUEUED"
          && survey.channel === "EMAIL"
          && attentionIsActive
          && survey.attention_id === job.aggregate_id
          && survey.email_outbox_id === job.id
          && survey.survey_token === surveyToken
          && normalizeEmail(survey.recipient_email || "") === normalizeEmail(job.recipient_email);
        if (!sourceIsValid) {
          await finish({
            outcome: "FAILED_PERMANENT",
            errorCode: "SOURCE_NO_LONGER_VALID",
            errorMessage: "La encuesta ya no cumple las condiciones para enviar la invitación.",
          });
          summary.permanentFailure += 1;
          continue;
        }
      } else if (job.template_key === "REFERRAL_RESOLVED") {
        const surveyId = requireUuid(job.template_data || {}, "surveyId");
        const surveyToken = requireUuid(job.template_data || {}, "surveyToken");
        const conclusion = requireText(job.template_data || {}, "conclusion", 3_000);
        const { data: survey, error: surveyError } = await client
          .from("referral_surveys")
          .select("referral_id,status,recipient_email,survey_token,email_outbox_id")
          .eq("id", surveyId)
          .maybeSingle();
        if (surveyError) throw new Error("SOURCE_VALIDATION_TRANSIENT:REFERRAL_SURVEY");

        const { data: referral, error: referralError } = await client
          .from("attention_referrals")
          .select("attention_id,status,conclusion")
          .eq("id", job.aggregate_id)
          .maybeSingle();
        if (referralError) throw new Error("SOURCE_VALIDATION_TRANSIENT:REFERRAL");

        let attentionIsActive = false;
        if (referral) {
          const { data: attention, error: attentionError } = await client
            .from("customer_attentions")
            .select("status")
            .eq("id", referral.attention_id)
            .maybeSingle();
          if (attentionError) throw new Error("SOURCE_VALIDATION_TRANSIENT:ATTENTION");
          attentionIsActive = attention?.status === "ACTIVE";
        }

        const sourceIsValid = survey?.status === "QUEUED"
          && referral?.status === "RESOLVED"
          && referral.conclusion?.trim() === conclusion
          && attentionIsActive
          && survey.referral_id === job.aggregate_id
          && survey.email_outbox_id === job.id
          && survey.survey_token === surveyToken
          && normalizeEmail(survey.recipient_email || "") === normalizeEmail(job.recipient_email);
        if (!sourceIsValid) {
          await finish({
            outcome: "FAILED_PERMANENT",
            errorCode: "SOURCE_NO_LONGER_VALID",
            errorMessage: "La resolución o su encuesta ya no cumplen las condiciones de envío.",
          });
          summary.permanentFailure += 1;
          continue;
        }
      }

      const rendered = renderEmail(job, publicAppUrl);
      const { response, result } = await callAppsScript(job, rendered, appsScriptUrl, hmacSecret, fromName);
      if (result.ok && result.acceptedAt) {
        await finish({ outcome: "SENT", providerCode: result.duplicate ? "ALREADY_ACCEPTED" : "ACCEPTED", acceptedAt: result.acceptedAt });
        summary.sent += 1;
        continue;
      }

      const code = result.code || `APPS_SCRIPT_HTTP_${response.status}`;
      const message = (result.message || "Google Apps Script rechazó el envío.").slice(0, 1000);
      const permanent = result.retryable === false || ["INVALID_RECIPIENT", "INVALID_MESSAGE", "AMBIGUOUS_DELIVERY"].includes(code);
      await finish({
        outcome: permanent ? "FAILED_PERMANENT" : "FAILED_RETRYABLE",
        providerCode: String(response.status), errorCode: code, errorMessage: message,
        nextAttemptAt: permanent ? undefined : nextRetryAt(job.attempt_count, result.retryAfterSeconds),
      });
      if (permanent) summary.permanentFailure += 1; else summary.retry += 1;
    } catch (sendError) {
      const rawMessage = sendError instanceof Error ? sendError.message : "Error de transporte.";
      const templateError = rawMessage.startsWith("TEMPLATE_DATA_INVALID:");
      const sourceValidationError = rawMessage.startsWith("SOURCE_VALIDATION_TRANSIENT:");
      await finish({
        outcome: templateError ? "FAILED_PERMANENT" : "FAILED_RETRYABLE",
        errorCode: templateError
          ? "INVALID_MESSAGE"
          : sourceValidationError ? "SOURCE_VALIDATION_ERROR" : "DELIVERY_TRANSPORT_ERROR",
        errorMessage: templateError
          ? "Los datos del mensaje no son válidos."
          : sourceValidationError
            ? "No se pudo validar temporalmente el origen del aviso."
            : "No se pudo contactar al servicio de correo.",
        nextAttemptAt: templateError ? undefined : nextRetryAt(job.attempt_count),
      });
      console.error("mail-dispatch:delivery-failed", { jobId: job.id, retryable: !templateError });
      if (templateError) summary.permanentFailure += 1; else summary.retry += 1;
    }
  }

  return json({ success: true, ...summary });
});
