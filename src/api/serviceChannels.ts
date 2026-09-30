import { supabase } from "../supabase/config";
import type { ServiceChannel } from "../types";

type ServiceChannelRow = {
  id: string;
  name: string;
  detail: string;
  is_active: boolean;
  disabled_by_name: string | null;
  disabled_at: string | null;
};

export interface ServiceChannelInput {
  name: string;
  detail: string;
}

const mapServiceChannel = (row: ServiceChannelRow): ServiceChannel => ({
  id: row.id,
  name: row.name,
  detail: row.detail,
  isActive: row.is_active,
  disabledByName: row.disabled_by_name,
  disabledAt: row.disabled_at,
});

const throwServiceChannelError = (error: {
  code?: string;
  message?: string;
}) => {
  if (error.code === "23505") {
    throw new Error("Ya existe un medio de atención con ese nombre.");
  }

  if (error.code === "23514") {
    throw new Error("El nombre y el detalle del medio son obligatorios.");
  }

  throw new Error(error.message || "No se pudo completar la operación.");
};

export const serviceChannelsApi = {
  list: async (): Promise<ServiceChannel[]> => {
    const { data, error } = await supabase
      .from("service_channels")
      .select(
        "id,name,detail,is_active,disabled_by_name,disabled_at",
      )
      .order("is_active", { ascending: false })
      .order("name", { ascending: true });

    if (error) throwServiceChannelError(error);
    return ((data || []) as ServiceChannelRow[]).map(mapServiceChannel);
  },

  create: async (values: ServiceChannelInput): Promise<ServiceChannel> => {
    const { data, error } = await supabase
      .from("service_channels")
      .insert({
        name: values.name.trim(),
        detail: values.detail.trim(),
      })
      .select("id,name,detail,is_active,disabled_by_name,disabled_at")
      .single();

    if (error) throwServiceChannelError(error);
    return mapServiceChannel(data as ServiceChannelRow);
  },

  update: async (
    id: string,
    values: ServiceChannelInput,
  ): Promise<ServiceChannel> => {
    const { data, error } = await supabase
      .from("service_channels")
      .update({
        name: values.name.trim(),
        detail: values.detail.trim(),
      })
      .eq("id", id)
      .select("id,name,detail,is_active,disabled_by_name,disabled_at")
      .single();

    if (error) throwServiceChannelError(error);
    return mapServiceChannel(data as ServiceChannelRow);
  },

  setStatus: async (id: string, isActive: boolean): Promise<void> => {
    const { error } = await supabase.rpc("set_service_channel_status", {
      p_service_channel_id: id,
      p_is_active: isActive,
    });

    if (error) throwServiceChannelError(error);
  },
};
