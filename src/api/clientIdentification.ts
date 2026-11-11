import { supabase } from "../supabase/config";
import type { Client, ClientLookupResult } from "../types";

export type ClientIdentificationRow = {
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

export const mapClientIdentificationRow = (
  row: ClientIdentificationRow,
): Client => ({
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

const getRpcErrorMessage = (error: { code?: string; message?: string }) => {
  if (error.code === "PGRST202") {
    return "La identificación protegida de clientes no está instalada. Ejecuta el SQL 19 en Supabase.";
  }
  return error.message || "No se pudo identificar al cliente.";
};

const invokeExternalDniLookup = async (
  dni: string,
): Promise<ClientLookupResult> => {
  const { data, error } = await supabase.functions.invoke("dni-lookup", {
    body: { dni },
  });

  if (error) {
    let message = "No se pudo consultar el DNI.";
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const body = (await context.clone().json()) as { message?: unknown };
        if (typeof body.message === "string" && body.message.trim()) {
          message = body.message;
        }
      } catch {
        // Se conserva el mensaje genérico cuando la función no devuelve JSON.
      }
    }
    throw new Error(message);
  }

  const result = data as {
    status?: unknown;
    source?: unknown;
    message?: unknown;
    client?: ClientIdentificationRow;
    person?: {
      firstName?: unknown;
      middleName?: unknown;
      paternalSurname?: unknown;
      maternalSurname?: unknown;
    };
  } | null;

  if (result?.status === "FOUND" && result.source === "LOCAL" && result.client) {
    return { source: "LOCAL", client: mapClientIdentificationRow(result.client) };
  }
  if (
    result?.status === "FOUND" &&
    result.source === "EXTERNAL" &&
    typeof result.person?.firstName === "string" &&
    (typeof result.person.middleName === "string" ||
      result.person.middleName === null) &&
    typeof result.person.paternalSurname === "string" &&
    typeof result.person.maternalSurname === "string"
  ) {
    return {
      source: "EXTERNAL",
      person: {
        firstName: result.person.firstName,
        middleName: result.person.middleName,
        paternalSurname: result.person.paternalSurname,
        maternalSurname: result.person.maternalSurname,
      },
    };
  }
  if (result?.status === "NOT_FOUND" || result?.status === "UNAVAILABLE") {
    return {
      source: "MANUAL",
      message:
        typeof result.message === "string"
          ? result.message
          : "No se encontraron datos. Ingresa la información manualmente.",
    };
  }
  throw new Error(
    "El servicio de consulta DNI devolvió una respuesta no reconocida.",
  );
};

export const clientIdentificationApi = {
  findByDni: async (dni: string): Promise<ClientLookupResult> => {
    const normalizedDni = dni.trim();
    const { data, error } = await supabase.rpc("find_client_by_exact_dni", {
      p_dni: normalizedDni,
    });
    if (error) throw new Error(getRpcErrorMessage(error));

    const localClient = (data || [])[0] as
      | ClientIdentificationRow
      | undefined;
    if (localClient) {
      return {
        source: "LOCAL",
        client: mapClientIdentificationRow(localClient),
      };
    }
    return invokeExternalDniLookup(normalizedDni);
  },

  findByEmail: async (email: string): Promise<Client[]> => {
    const { data, error } = await supabase.rpc("find_clients_by_exact_email", {
      p_email: email.trim().toLowerCase(),
    });
    if (error) throw new Error(getRpcErrorMessage(error));
    return ((data || []) as ClientIdentificationRow[]).map(
      mapClientIdentificationRow,
    );
  },

  getForAttention: async (attentionId: string): Promise<Client | null> => {
    const { data, error } = await supabase.rpc("get_client_for_attention", {
      p_attention_id: attentionId,
    });
    if (error) throw new Error(getRpcErrorMessage(error));
    const row = (data || [])[0] as ClientIdentificationRow | undefined;
    return row ? mapClientIdentificationRow(row) : null;
  },
};
