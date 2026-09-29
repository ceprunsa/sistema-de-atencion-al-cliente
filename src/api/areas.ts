import { supabase } from "../supabase/config";
import type { Area } from "../types";

type AreaRow = { id: string; name: string };

const mapArea = (row: AreaRow): Area => ({ id: row.id, name: row.name });

const throwAreaError = (error: { code?: string; message?: string }) => {
  if (error.code === "23505") {
    throw new Error("Ya existe un área con ese nombre.");
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
      .select("*")
      .order("name", { ascending: true });
    if (error) throwAreaError(error);
    return ((data || []) as AreaRow[]).map(mapArea);
  },

  create: async (name: string): Promise<Area> => {
    const { data, error } = await supabase
      .from("areas")
      .insert({ name: name.trim() })
      .select("*")
      .single();
    if (error) throwAreaError(error);
    return mapArea(data as AreaRow);
  },

  update: async (id: string, name: string): Promise<Area> => {
    const { data, error } = await supabase
      .from("areas")
      .update({ name: name.trim() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throwAreaError(error);
    return mapArea(data as AreaRow);
  },

  remove: async (id: string): Promise<void> => {
    const { error } = await supabase.from("areas").delete().eq("id", id);
    if (error) throwAreaError(error);
  },
};
