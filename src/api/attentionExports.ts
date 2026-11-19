import { supabase } from "../supabase/config";
import type {
  AttentionExportJob,
  AttentionExportMode,
  AttentionExportStatus,
  StartAttentionExportInput,
} from "../types";

type ExportJobRow = {
  id: string;
  export_mode: AttentionExportMode;
  filters: Record<string, unknown>;
  status: AttentionExportStatus;
  total_rows: number;
  progress_rows: number;
  attempt_count: number;
  file_name: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  expires_at: string | null;
};

const invoke = async <T>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke("attention-export", { body });
  if (error) {
    let message = error.message || "No se pudo comunicar con el servicio de exportacion.";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { message?: unknown; code?: unknown };
        if (typeof payload.message === "string" && payload.message.trim()) {
          message = payload.message.trim();
        }
      } catch {
        // La respuesta puede no ser JSON si el gateway rechazo la solicitud.
      }
    }
    throw new Error(message);
  }
  return data as T;
};

const mapJob = (row: ExportJobRow): AttentionExportJob => ({
  id: row.id,
  mode: row.export_mode,
  filters: row.filters || {},
  status: row.status,
  totalRows: Number(row.total_rows || 0),
  progressRows: Number(row.progress_rows || 0),
  attemptCount: Number(row.attempt_count || 0),
  fileName: row.file_name,
  errorCode: row.error_code,
  errorMessage: row.error_message,
  createdAt: row.created_at,
  completedAt: row.completed_at,
  expiresAt: row.expires_at,
});

export const attentionExportsApi = {
  start: async (input: StartAttentionExportInput) => {
    return invoke<{ job: { job_id: string; job_status: AttentionExportStatus; reused: boolean } }>({
      action: "start",
      mode: input.mode,
      filters: input.filters,
      startDate: input.startDate || null,
      endDate: input.endDate || null,
    });
  },

  list: async (): Promise<AttentionExportJob[]> => {
    const response = await invoke<{ jobs: ExportJobRow[] }>({ action: "list" });
    return (response.jobs || []).map(mapJob);
  },

  retry: async (jobId: string): Promise<void> => {
    await invoke<{ ok: boolean }>({ action: "retry", jobId });
  },

  download: async (jobId: string): Promise<{ url: string; fileName: string }> => {
    return invoke<{ url: string; fileName: string }>({ action: "download", jobId });
  },
};
