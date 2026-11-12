import { supabase } from "../supabase/config";
import type { Area } from "../types";

type AreaRow = {
  id: string;
  name: string;
  group_email: string | null;
  is_active: boolean;
  disabled_by_name: string | null;
  disabled_at: string | null;
};

export interface AreaInput {
  name: string;
  groupEmail: string;
}

const mapArea = (row: AreaRow): Area => ({
  id: row.id,
  name: row.name,
  groupEmail: row.group_email,
  isActive: row.is_active,
  disabledByName: row.disabled_by_name,
  disabledAt: row.disabled_at,
});

const throwAreaError = (error: { code?: string; message?: string }) => {
  if (error.code === "23505") {
    if (error.message?.includes("areas_group_email_lower_uidx")) {
      throw new Error("Ese correo de grupo ya está asignado a otra área.");
    }
    throw new Error("Ya existe un área con ese nombre.");
  }
  if (error.code === "23514") {
    throw new Error("El correo de grupo debe ser válido y terminar en @cepr.unsa.pe.");
  }
  if (error.code === "23503") {
    throw new Error(
      "No se puede eliminar el área porque tiene usuarios relacionados.",
    );
  }
  throw new Error(error.message || "No se pudo completar la operación.");
};

export const areasApi = {
  list: async (): Promise<Area[]> => {
    const { data, error } = await supabase
      .from("areas")
      .select("id,name,group_email,is_active,disabled_by_name,disabled_at")
      .order("is_active", { ascending: false })
      .order("name", { ascending: true });
    if (error) throwAreaError(error);
    return ((data || []) as AreaRow[]).map(mapArea);
  },

  create: async (values: AreaInput): Promise<Area> => {
    const { data, error } = await supabase
      .from("areas")
      .insert({
        name: values.name.trim(),
        group_email: values.groupEmail.trim().toLowerCase(),
      })
      .select("id,name,group_email,is_active,disabled_by_name,disabled_at")
      .single();
    if (error) throwAreaError(error);
    return mapArea(data as AreaRow);
  },

  update: async (id: string, values: AreaInput): Promise<Area> => {
    const { data, error } = await supabase
      .from("areas")
      .update({
        name: values.name.trim(),
        group_email: values.groupEmail.trim().toLowerCase(),
      })
      .eq("id", id)
      .select("id,name,group_email,is_active,disabled_by_name,disabled_at")
      .single();
    if (error) throwAreaError(error);
    return mapArea(data as AreaRow);
  },

  remove: async (id: string): Promise<void> => {
    const { error } = await supabase.from("areas").delete().eq("id", id);
    if (error) throwAreaError(error);
  },

  setStatus: async (id: string, isActive: boolean): Promise<void> => {
    const { error } = await supabase.rpc("set_area_active", {
      p_area_id: id,
      p_is_active: isActive,
    });
    if (error) throwAreaError(error);
  },

  getComplaintClosureArea: async (): Promise<string | null> => {
    const { data, error } = await supabase.rpc("get_complaint_closure_area");
    if (error) throwAreaError(error);
    return data?.[0]?.area_id || null;
  },

  setComplaintClosureArea: async (areaId: string): Promise<void> => {
    const { error } = await supabase.rpc("set_complaint_closure_area", {
      p_area_id: areaId,
    });
    if (error) throwAreaError(error);
  },
};
