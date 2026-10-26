import { supabase } from "../supabase/config";
import type { AdmissionProcess, AdmissionProcessPhase } from "../types";

export interface AdmissionProcessInput {
  phase: AdmissionProcessPhase;
  customLabel?: string | null;
  year: number;
}

const select = "id,phase,custom_label,year,is_active,created_at,updated_at";

const mapProcess = (row: { id: string; phase: string; custom_label: string | null; year: number; is_active: boolean }): AdmissionProcess => ({
  id: row.id,
  phase: row.phase as AdmissionProcessPhase,
  customLabel: row.custom_label,
  year: row.year,
  isActive: row.is_active,
});

const throwError = (error: { code?: string; message?: string }) => {
  if (error.code === "23505") throw new Error("Ya existe ese proceso para el año indicado.");
  if (error.code === "23514") throw new Error("Revisa la fase, el nombre personalizado y el año.");
  throw new Error(error.message || "No se pudo guardar el proceso de admisión.");
};

export const admissionProcessesApi = {
  list: async (): Promise<AdmissionProcess[]> => {
    const { data, error } = await supabase.from("admission_processes").select(select).order("year", { ascending: false }).order("phase");
    if (error) throwError(error);
    return (data || []).map(mapProcess);
  },
  create: async (values: AdmissionProcessInput): Promise<AdmissionProcess> => {
    const { data, error } = await supabase.from("admission_processes").insert({
      phase: values.phase,
      custom_label: values.phase === "CUSTOM" ? values.customLabel?.trim() || null : null,
      year: values.year,
    }).select(select).single();
    if (error) throwError(error);
    return mapProcess(data!);
  },
  update: async (id: string, values: AdmissionProcessInput): Promise<AdmissionProcess> => {
    const { data, error } = await supabase.from("admission_processes").update({
      phase: values.phase,
      custom_label: values.phase === "CUSTOM" ? values.customLabel?.trim() || null : null,
      year: values.year,
    }).eq("id", id).select(select).single();
    if (error) throwError(error);
    return mapProcess(data!);
  },
  setStatus: async (id: string, isActive: boolean): Promise<void> => {
    const { error } = await supabase.from("admission_processes").update({ is_active: isActive }).eq("id", id);
    if (error) throwError(error);
  },
};
