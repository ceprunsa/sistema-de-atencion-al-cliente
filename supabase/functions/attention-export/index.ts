// Exportacion asincrona de atenciones. Requiere autenticacion JWT.
// @ts-ignore: Supabase Edge Runtime resuelve paquetes npm al desplegar.
import { createClient } from "npm:@supabase/supabase-js@2";
// @ts-ignore: ExcelJS se resuelve como dependencia npm durante el despliegue.
import ExcelJS from "npm:exceljs@4.4.0";

declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (request: Request) => Response | Promise<Response>) => void;
};
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const BUCKET = "attention-exports";
const BATCH_SIZE = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(body),
  { status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } },
);

type ExportJob = {
  id: string;
  requested_by: string;
  file_name: string;
  total_rows: number;
  attempt_count: number;
};

type ExportRow = {
  attention_id: string;
  rac_code: string;
  created_at: string;
  attention_status: string;
  client_name: string;
  client_dni: string | null;
  client_email: string | null;
  client_phone: string | null;
  service_channel: string;
  workstation: string | null;
  created_by_name: string;
  requester_type: string;
  admission_processes: string | null;
  consultation_types: string | null;
  consultation_topics: string | null;
  conclusion: string;
  survey_status: string;
  referral_area: string | null;
  referral_status: string;
  referral_conclusion: string | null;
};

const requesterLabels: Record<string, string> = {
  APPLICANT: "Postulante",
  RELATIVE: "Familiar",
  OTHER: "Otro",
};
const attentionStatusLabels: Record<string, string> = { ACTIVE: "Activa", DISABLED: "Inhabilitada" };
const surveyStatusLabels: Record<string, string> = {
  NONE: "Sin encuesta", PENDING_DECISION: "Por decidir", QUEUED: "En cola",
  SENT: "Enviada", COMPLETED: "Completada", SKIPPED: "Omitida", CANCELLED: "Cancelada",
};
const referralStatusLabels: Record<string, string> = {
  NONE: "Sin derivacion", PENDING: "Pendiente", RESOLVED: "Resuelta",
  DISABLED: "Inhabilitada", CANCELLED: "Cancelada",
};

const formatLimaDate = (value: string) => new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
}).format(new Date(value));

const optionalText = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const optionalUuid = (value: unknown) => {
  const normalized = optionalText(value);
  if (!normalized) return null;
  if (!UUID_PATTERN.test(normalized)) throw new Error("INVALID_UUID_FILTER");
  return normalized;
};

const processExport = async (admin: ReturnType<typeof createClient>, jobId: string) => {
  const { data: claimed, error: claimError } = await admin.rpc("claim_attention_export_job", { p_job_id: jobId });
  if (claimError) throw claimError;
  const job = (claimed?.[0] || null) as ExportJob | null;
  if (!job) return;

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Sistema de Registro de Atencion al Cliente";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Atenciones", { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = [
      { header: "Codigo RAC", key: "rac", width: 22 },
      { header: "Fecha de registro", key: "createdAt", width: 22 },
      { header: "Estado", key: "status", width: 16 },
      { header: "Cliente", key: "client", width: 34 },
      { header: "DNI", key: "dni", width: 14 },
      { header: "Correo", key: "email", width: 32 },
      { header: "Telefono", key: "phone", width: 16 },
      { header: "Medio", key: "channel", width: 24 },
      { header: "Mesa", key: "workstation", width: 24 },
      { header: "Registrado por", key: "createdBy", width: 32 },
      { header: "Solicitante", key: "requester", width: 18 },
      { header: "Procesos de admision", key: "processes", width: 36 },
      { header: "Tipos de consulta", key: "types", width: 36 },
      { header: "Temas de consulta", key: "topics", width: 52 },
      { header: "Conclusion", key: "conclusion", width: 60 },
      { header: "Estado de encuesta", key: "survey", width: 20 },
      { header: "Area de derivacion", key: "referralArea", width: 30 },
      { header: "Estado de derivacion", key: "referralStatus", width: 22 },
      { header: "Conclusion de derivacion", key: "referralConclusion", width: 60 },
    ];
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A2855" } };
    header.alignment = { vertical: "middle" };
    sheet.autoFilter = { from: "A1", to: "S1" };

    let afterCreatedAt: string | null = null;
    let afterId: string | null = null;
    let exported = 0;
    while (true) {
      const { data, error } = await admin.rpc("get_attention_export_batch", {
        p_job_id: job.id,
        p_after_created_at: afterCreatedAt,
        p_after_id: afterId,
        p_limit: BATCH_SIZE,
      });
      if (error) throw error;
      const rows = (data || []) as ExportRow[];
      for (const row of rows) {
        sheet.addRow({
          rac: row.rac_code,
          createdAt: formatLimaDate(row.created_at),
          status: attentionStatusLabels[row.attention_status] || row.attention_status,
          client: row.client_name,
          dni: row.client_dni || "",
          email: row.client_email || "",
          phone: row.client_phone || "",
          channel: row.service_channel,
          workstation: row.workstation || "No disponible",
          createdBy: row.created_by_name,
          requester: requesterLabels[row.requester_type] || row.requester_type,
          processes: row.admission_processes || "",
          types: row.consultation_types || "",
          topics: row.consultation_topics || "",
          conclusion: row.conclusion,
          survey: surveyStatusLabels[row.survey_status] || row.survey_status,
          referralArea: row.referral_area || "",
          referralStatus: referralStatusLabels[row.referral_status] || row.referral_status,
          referralConclusion: row.referral_conclusion || "",
        });
      }
      exported += rows.length;
      await admin.from("attention_export_jobs").update({ progress_rows: exported }).eq("id", job.id);
      if (rows.length < BATCH_SIZE) break;
      const last = rows[rows.length - 1];
      afterCreatedAt = last.created_at;
      afterId = last.attention_id;
    }

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) row.alignment = { vertical: "top", wrapText: true };
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const storagePath = `${job.requested_by}/${job.id}.xlsx`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(
      storagePath,
      new Uint8Array(buffer),
      { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: true },
    );
    if (uploadError) throw uploadError;

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error: completeError } = await admin.from("attention_export_jobs").update({
      status: "COMPLETED",
      progress_rows: exported,
      storage_path: storagePath,
      completed_at: new Date().toISOString(),
      expires_at: expiresAt,
      error_code: null,
      error_message: null,
    }).eq("id", job.id).eq("status", "PROCESSING");
    if (completeError) throw completeError;
  } catch (error) {
    console.error("attention-export:processing-failed", { jobId, error });
    await admin.from("attention_export_jobs").update({
      status: "FAILED",
      error_code: "PROCESSING_ERROR",
      error_message: (error instanceof Error ? error.message : "No se pudo generar el archivo.").slice(0, 1000),
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);
  }
};

const housekeeping = async (admin: ReturnType<typeof createClient>) => {
  const now = new Date().toISOString();
  const { data: expired } = await admin.from("attention_export_jobs")
    .select("id,storage_path").eq("status", "COMPLETED").lte("expires_at", now).limit(100);
  const paths = (expired || []).flatMap((job) => typeof job.storage_path === "string" ? [job.storage_path] : []);
  if (paths.length) await admin.storage.from(BUCKET).remove(paths);
  const ids = (expired || []).map((job) => job.id);
  if (ids.length) await admin.from("attention_export_jobs").update({ status: "EXPIRED", storage_path: null }).in("id", ids);

  const stale = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await admin.from("attention_export_jobs").update({
    status: "FAILED", error_code: "PROCESS_INTERRUPTED",
    error_message: "La preparacion fue interrumpida. Puedes reintentarla.", completed_at: now,
  }).eq("status", "PROCESSING").lt("started_at", stale);
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED", message: "Metodo no permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization") || "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ code: "SERVICE_NOT_CONFIGURED", message: "El servicio de exportacion no esta configurado." }, 500);
  }
  if (!authorization) return json({ code: "UNAUTHORIZED", message: "Debes iniciar sesion." }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ code: "UNAUTHORIZED", message: "La sesion no es valida." }, 401);

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ code: "INVALID_REQUEST", message: "La solicitud no es valida." }, 400); }
  const action = typeof body.action === "string" ? body.action : "";
  EdgeRuntime.waitUntil(housekeeping(admin));

  if (action === "start") {
    const filters = body.filters && typeof body.filters === "object" ? body.filters as Record<string, unknown> : {};
    let areaId: string | null;
    let admissionProcessId: string | null;
    let serviceChannelId: string | null;
    let workstationId: string | null;
    try {
      areaId = optionalUuid(filters.areaId);
      admissionProcessId = optionalUuid(filters.admissionProcessId);
      serviceChannelId = optionalUuid(filters.serviceChannelId);
      workstationId = optionalUuid(filters.workstationId);
    } catch {
      return json({ code: "INVALID_FILTER", message: "Uno de los filtros seleccionados no es valido." }, 400);
    }
    const { data, error } = await userClient.rpc("request_attention_export", {
      p_mode: optionalText(body.mode) || "ALL",
      p_search: optionalText(filters.search) || "",
      p_survey_status: optionalText(filters.surveyStatus),
      p_referral_status: optionalText(filters.referralStatus),
      p_area_id: areaId,
      p_admission_process_id: admissionProcessId,
      p_service_channel_id: serviceChannelId,
      p_workstation_id: workstationId,
      p_start_date: optionalText(body.startDate),
      p_end_date: optionalText(body.endDate),
    });
    if (error) return json({ code: error.code || "EXPORT_REQUEST_FAILED", message: error.message }, 400);
    const job = data?.[0];
    if (!job) return json({ code: "EXPORT_REQUEST_FAILED", message: "No se pudo crear la exportacion." }, 500);
    if (["QUEUED", "FAILED"].includes(job.job_status)) EdgeRuntime.waitUntil(processExport(admin, job.job_id));
    return json({ job });
  }

  if (action === "list") {
    const { data, error } = await userClient.from("attention_export_jobs").select("id,export_mode,filters,status,total_rows,progress_rows,attempt_count,file_name,error_code,error_message,created_at,completed_at,expires_at").order("created_at", { ascending: false }).limit(10);
    if (error) return json({ code: error.code || "EXPORT_LIST_FAILED", message: error.message }, 400);
    return json({ jobs: data || [] });
  }

  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  if (!jobId) return json({ code: "INVALID_REQUEST", message: "Falta identificar la exportacion." }, 400);

  if (action === "retry") {
    const { error } = await userClient.rpc("retry_attention_export", { p_job_id: jobId });
    if (error) return json({ code: error.code || "EXPORT_RETRY_FAILED", message: error.message }, 400);
    EdgeRuntime.waitUntil(processExport(admin, jobId));
    return json({ ok: true });
  }

  if (action === "download") {
    const { data: job, error } = await userClient.from("attention_export_jobs")
      .select("storage_path,file_name,status,expires_at,is_admin").eq("id", jobId).maybeSingle();
    if (error) {
      console.error("attention-export:download-job-query-failed", { jobId, userId: authData.user.id, code: error.code, message: error.message });
      return json({ code: "JOB_QUERY_FAILED", message: "No se pudo consultar la exportacion solicitada." }, 500);
    }
    if (!job) return json({ code: "NOT_FOUND", message: "La exportacion no existe o no te pertenece." }, 404);
    if (job.is_admin) {
      const { data: remainsAdmin, error: roleError } = await userClient.rpc("is_admin");
      if (roleError || remainsAdmin !== true) {
        console.warn("attention-export:admin-download-role-revoked", { jobId, userId: authData.user.id });
        return json({
          code: "FORBIDDEN",
          message: "Ya no tienes el rol administrador requerido para descargar esta exportacion.",
        }, 403);
      }
    }
    if (job.status !== "COMPLETED" || !job.storage_path || !job.expires_at || new Date(job.expires_at) <= new Date()) {
      console.warn("attention-export:download-file-not-available", {
        jobId,
        userId: authData.user.id,
        status: job.status,
        hasStoragePath: Boolean(job.storage_path),
        expiresAt: job.expires_at,
      });
      return json({ code: "FILE_NOT_AVAILABLE", message: "El archivo aun no esta disponible o ya vencio." }, 409);
    }
    const { data, error: signedError } = await admin.storage.from(BUCKET).createSignedUrl(
      job.storage_path,
      300,
      { download: job.file_name },
    );
    if (signedError || !data?.signedUrl) {
      console.error("attention-export:create-signed-url-failed", {
        jobId,
        userId: authData.user.id,
        bucket: BUCKET,
        storagePath: job.storage_path,
        message: signedError?.message,
      });
      return json({
        code: "DOWNLOAD_FAILED",
        message: signedError?.message || "No se pudo crear el enlace temporal de descarga.",
      }, 500);
    }
    return json({ url: data.signedUrl, fileName: job.file_name, expiresIn: 300 });
  }

  return json({ code: "INVALID_ACTION", message: "Accion no valida." }, 400);
});
