import { supabase } from "../supabase/config";
import type {
  Client,
  ClientAdminDetail,
  ClientAttentionListItem,
  ClientInput,
  ClientListItem,
  PaginatedResponse,
} from "../types";

type ClientResultRow = {
  id: string;
  dni: string | null;
  display_name: string;
  first_name: string | null;
  middle_name: string | null;
  paternal_surname: string | null;
  maternal_surname: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
};

const mapClient = (row: ClientResultRow): Client => ({
  id: row.id,
  dni: row.dni,
  displayName: row.display_name,
  firstName: row.first_name,
  middleName: row.middle_name,
  paternalSurname: row.paternal_surname,
  maternalSurname: row.maternal_surname,
  email: row.email,
  phone: row.phone,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toClientPayload = (values: ClientInput) => ({
  dni: values.dni.trim() || null,
  display_name: values.displayName.trim(),
  first_name: values.firstName.trim() || null,
  middle_name: values.middleName.trim() || null,
  paternal_surname: values.paternalSurname.trim() || null,
  maternal_surname: values.maternalSurname.trim() || null,
  email: values.email.trim().toLowerCase() || null,
  phone: values.phone.trim() || null,
});

const getClientErrorMessage = (error: { code?: string; message?: string }) => {
  if (error.code === "PGRST202") {
    return "La gestión de clientes no está instalada. Ejecuta el SQL 19 en Supabase.";
  }
  if (error.code === "42501") {
    return "Solo un administrador puede consultar la gestión de clientes.";
  }
  if (error.code === "23505") return "Ya existe otro cliente con ese DNI.";
  if (error.code === "22023") return "Debes confirmar expresamente la corrección del DNI.";
  if (error.code === "P0002") return "El cliente no existe.";
  return error.message || "No se pudieron consultar los clientes.";
};

export const clientsApi = {
  list: async (
    page: number,
    limit: number,
    search: string,
  ): Promise<PaginatedResponse<ClientListItem>> => {
    const { data, error } = await supabase.rpc("list_clients_admin", {
      p_page: page,
      p_limit: limit,
      p_search: search.trim(),
    });
    if (error) throw new Error(getClientErrorMessage(error));

    const rows = data || [];
    const total = Number(rows[0]?.total_count || 0);
    return {
      data: rows.map((row) => ({
        id: row.id,
        dni: row.dni,
        displayName: row.display_name,
        firstName: row.first_name,
        middleName: row.middle_name,
        paternalSurname: row.paternal_surname,
        maternalSurname: row.maternal_surname,
        email: row.email,
        phone: row.phone,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        attentionCount: Number(row.attention_count || 0),
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  getById: async (id: string): Promise<ClientAdminDetail | null> => {
    const { data, error } = await supabase.rpc("get_client_admin", {
      p_client_id: id,
    });
    if (error) throw new Error(getClientErrorMessage(error));
    const row = data?.[0];
    if (!row) return null;
    return {
      ...mapClient(row),
      createdById: row.created_by,
      attentionCount: Number(row.attention_count || 0),
    };
  },

  create: async (values: ClientInput): Promise<Client> => {
    const { data, error } = await supabase.rpc("create_client_admin", {
      p_client: toClientPayload(values),
    });
    if (error) throw new Error(getClientErrorMessage(error));
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Supabase no devolvió el cliente creado.");
    }
    return mapClient(data as unknown as ClientResultRow);
  },

  update: async (
    id: string,
    values: ClientInput,
    confirmDniChange: boolean,
  ): Promise<Client> => {
    const { data, error } = await supabase.rpc("update_client_admin", {
      p_client_id: id,
      p_client: toClientPayload(values),
      p_confirm_dni_change: confirmDniChange,
    });
    if (error) throw new Error(getClientErrorMessage(error));
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Supabase no devolvió el cliente actualizado.");
    }
    return mapClient(data as unknown as ClientResultRow);
  },

  listAttentions: async (
    clientId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<ClientAttentionListItem>> => {
    const { data, error } = await supabase.rpc("list_client_attentions_admin", {
      p_client_id: clientId,
      p_page: page,
      p_limit: limit,
    });
    if (error) throw new Error(getClientErrorMessage(error));

    const rows = data || [];
    const total = Number(rows[0]?.total_count || 0);
    return {
      data: rows.map((row) => ({
        id: row.id,
        racCode: row.rac_code,
        status: row.attention_status as ClientAttentionListItem["status"],
        requesterType: row.requester_type as ClientAttentionListItem["requesterType"],
        serviceChannelName: row.service_channel_name,
        createdByName: row.created_by_name,
        createdAt: row.created_at,
        referralStatus: row.referral_status as ClientAttentionListItem["referralStatus"],
        referralAreaName: row.referral_area_name,
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },
};
