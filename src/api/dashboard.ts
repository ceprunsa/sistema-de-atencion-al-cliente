import { supabase } from "../supabase/config";
import type { DashboardStatistics } from "../types";

export interface DashboardFilters {
  dateFrom: string;
  dateTo: string;
  admissionProcessId: string;
}

export const dashboardApi = {
  getStatistics: async (filters: DashboardFilters): Promise<DashboardStatistics> => {
    const { data, error } = await supabase.rpc("get_dashboard_statistics_v2", {
      p_date_from: filters.dateFrom,
      p_date_to: filters.dateTo,
      p_admission_process_id: filters.admissionProcessId || null,
    });
    if (error?.code === "PGRST202") throw new Error("La gráfica del Dashboard no está instalada. Ejecuta el SQL 15 en Supabase.");
    if (error) throw new Error(error.message || "No se pudieron cargar las estadísticas.");
    const result = data as unknown as DashboardStatistics | null;
    if (!result || typeof result.totalAttentions !== "number") throw new Error("Supabase devolvió estadísticas no válidas.");
    return result;
  },
};
