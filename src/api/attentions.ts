import { supabase } from "../supabase/config";
import type { Database } from "../supabase/types";
import type {
  Area,
  AttentionListItem,
  Client,
  ConsultationTopic,
  ConsultationType,
  CreatedCustomerAttention,
  CustomerAttentionDetail,
  CreateCustomerAttentionInput,
  KinshipType,
  NewAttentionCatalogs,
  PaginatedResponse,
  ServiceChannel,
  UpdateCustomerAttentionInput,
} from "../types";

type ListRow = {
  id: string;
  rac_code: string;
  status: string;
  requester_type: string;
  created_at: string;
  created_by_name: string;
  clients: {
    dni: string;
    first_name: string;
    middle_name: string | null;
    paternal_surname: string;
    maternal_surname: string;
  } | null;
  service_channels: { name: string } | null;
};

type DetailRow = Database["public"]["Tables"]["customer_attentions"]["Row"] & {
  clients: DatabaseClientRow | null;
  service_channels: Database["public"]["Tables"]["service_channels"]["Row"] | null;
  kinship_types: { name: string } | null;
  attention_topics: Array<{
    absence_count: number | null;
    consultation_topics: {
      id: string;
      name: string;
      consultation_types: { name: string } | null;
    } | null;
  }>;
  attention_referrals:
    | Database["public"]["Tables"]["attention_referrals"]["Row"]
    | Array<Database["public"]["Tables"]["attention_referrals"]["Row"]>
    | null;
};

type ClientRow = DatabaseClientRow;
type DatabaseClientRow = {
  id: string;
  dni: string;
  first_name: string;
  middle_name: string | null;
  paternal_surname: string;
  maternal_surname: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
};

const mapClient = (row: ClientRow): Client => ({
  id: row.id,
  dni: row.dni,
  firstName: row.first_name,
  middleName: row.middle_name,
  paternalSurname: row.paternal_surname,
  maternalSurname: row.maternal_surname,
  email: row.email,
  phone: row.phone,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const getFullName = (person: {
  first_name: string;
  middle_name: string | null;
  paternal_surname: string;
  maternal_surname: string;
}) =>
  [
    person.first_name,
    person.middle_name,
    person.paternal_surname,
    person.maternal_surname,
  ]
    .filter(Boolean)
    .join(" ");

const getErrorMessage = (error: { code?: string; message?: string }) => {
  if (error.code === "PGRST202") {
    return "La función de registro no está instalada. Ejecuta 03_customer_service.sql en Supabase.";
  }
  return error.message || "No se pudo completar la operación.";
};

export const attentionsApi = {
  list: async (
    page: number,
    limit: number,
    search: string,
  ): Promise<PaginatedResponse<AttentionListItem>> => {
    const normalizedSearch = search.trim().replace(/[^a-zA-Z0-9-]/g, "");
    let clientIds: string[] = [];

    if (normalizedSearch && /\d/.test(normalizedSearch)) {
      const dniSearch = normalizedSearch.replace(/\D/g, "");
      if (dniSearch) {
        const { data: clients, error: clientsError } = await supabase
          .from("clients")
          .select("id")
          .ilike("dni", `%${dniSearch}%`);
        if (clientsError) throw new Error(getErrorMessage(clientsError));
        clientIds = (clients || []).map((client) => client.id);
      }
    }

    let query = supabase
      .from("customer_attentions")
      .select(
        "id,rac_code,status,requester_type,created_at,created_by_name,clients!inner(dni,first_name,middle_name,paternal_surname,maternal_surname),service_channels(name)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    if (normalizedSearch) {
      const racFilter = `rac_code.ilike.%${normalizedSearch}%`;
      query = clientIds.length
        ? query.or(`${racFilter},client_id.in.(${clientIds.join(",")})`)
        : query.or(racFilter);
    }

    const from = (page - 1) * limit;
    const { data, error, count } = await query.range(from, from + limit - 1);
    if (error) throw new Error(getErrorMessage(error));

    const total = count || 0;
    return {
      data: ((data || []) as unknown as ListRow[]).map((row) => ({
        id: row.id,
        racCode: row.rac_code,
        status: row.status as AttentionListItem["status"],
        requesterType: row.requester_type as AttentionListItem["requesterType"],
        clientDni: row.clients?.dni || "",
        clientName: row.clients ? getFullName(row.clients) : "Cliente no disponible",
        serviceChannelName: row.service_channels?.name || "Medio no disponible",
        createdByName: row.created_by_name,
        createdAt: row.created_at,
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  getById: async (id: string): Promise<CustomerAttentionDetail | null> => {
    const { data, error } = await supabase
      .from("customer_attentions")
      .select(
        "*,clients(*),service_channels(*),kinship_types(name),attention_topics(absence_count,consultation_topics(id,name,consultation_types(name))),attention_referrals(*)",
      )
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(getErrorMessage(error));
    if (!data) return null;

    const row = data as unknown as DetailRow;
    if (!row.clients || !row.service_channels) {
      throw new Error("La atención no tiene todos sus datos relacionados disponibles.");
    }

    const referral = Array.isArray(row.attention_referrals)
      ? row.attention_referrals[0]
      : row.attention_referrals;
    return {
      id: row.id,
      racYear: row.rac_year,
      racNumber: row.rac_number,
      racCode: row.rac_code,
      clientId: row.client_id,
      serviceChannelId: row.service_channel_id,
      requesterType: row.requester_type as CustomerAttentionDetail["requesterType"],
      kinshipTypeId: row.kinship_type_id,
      conclusion: row.conclusion,
      status: row.status as CustomerAttentionDetail["status"],
      createdByName: row.created_by_name,
      createdByEmail: row.created_by_email,
      createdAt: row.created_at,
      updatedByName: row.updated_by_name,
      updatedAt: row.updated_at,
      disabledReason: row.disabled_reason,
      disabledByName: row.disabled_by_name,
      disabledAt: row.disabled_at,
      client: mapClient(row.clients),
      serviceChannel: {
        id: row.service_channels.id,
        name: row.service_channels.name,
        detail: row.service_channels.detail,
        isActive: row.service_channels.is_active,
        disabledByName: row.service_channels.disabled_by_name,
        disabledAt: row.service_channels.disabled_at,
      },
      kinshipName: row.kinship_types?.name || null,
      topics: row.attention_topics
        .filter((item) => item.consultation_topics)
        .map((item) => ({
          id: item.consultation_topics!.id,
          name: item.consultation_topics!.name,
          consultationTypeName:
            item.consultation_topics!.consultation_types?.name || "Sin tipo",
          absenceCount: item.absence_count,
        })),
      referral: referral
        ? {
            id: referral.id,
            attentionId: referral.attention_id,
            destinationAreaId: referral.destination_area_id,
            destinationAreaName: referral.destination_area_name,
            referredByName: referral.referred_by_name,
            referredAt: referral.referred_at,
            conclusion: referral.conclusion,
            concludedByName: referral.concluded_by_name,
            concludedAt: referral.concluded_at,
          }
        : null,
    };
  },

  findClientByDni: async (dni: string): Promise<Client | null> => {
    const { data, error } = await supabase
      .from("clients")
      .select(
        "id,dni,first_name,middle_name,paternal_surname,maternal_surname,email,phone,created_at,updated_at",
      )
      .eq("dni", dni)
      .maybeSingle();

    if (error) throw new Error(getErrorMessage(error));
    return data ? mapClient(data as ClientRow) : null;
  },

  getNewAttentionCatalogs: async (): Promise<NewAttentionCatalogs> => {
    const [channels, types, topics, kinships, areas] = await Promise.all([
      supabase
        .from("service_channels")
        .select("id,name,detail,is_active,disabled_by_name,disabled_at")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("consultation_types")
        .select("id,name,display_order,is_active")
        .eq("is_active", true)
        .order("display_order"),
      supabase
        .from("consultation_topics")
        .select(
          "id,consultation_type_id,name,display_order,requires_absence_count,is_active",
        )
        .eq("is_active", true)
        .order("display_order"),
      supabase
        .from("kinship_types")
        .select("id,name,display_order,is_active")
        .eq("is_active", true)
        .order("display_order"),
      supabase.from("areas").select("id,name").order("name"),
    ]);

    const firstError = [channels, types, topics, kinships, areas].find(
      (result) => result.error,
    )?.error;
    if (firstError) throw new Error(getErrorMessage(firstError));

    return {
      serviceChannels: (channels.data || []).map(
        (row): ServiceChannel => ({
          id: row.id,
          name: row.name,
          detail: row.detail,
          isActive: row.is_active,
          disabledByName: row.disabled_by_name,
          disabledAt: row.disabled_at,
        }),
      ),
      consultationTypes: (types.data || []).map(
        (row): ConsultationType => ({
          id: row.id,
          name: row.name,
          displayOrder: row.display_order,
          isActive: row.is_active,
        }),
      ),
      consultationTopics: (topics.data || []).map(
        (row): ConsultationTopic => ({
          id: row.id,
          consultationTypeId: row.consultation_type_id,
          name: row.name,
          displayOrder: row.display_order,
          requiresAbsenceCount: row.requires_absence_count,
          isActive: row.is_active,
        }),
      ),
      kinshipTypes: (kinships.data || []).map(
        (row): KinshipType => ({
          id: row.id,
          name: row.name,
          displayOrder: row.display_order,
          isActive: row.is_active,
        }),
      ),
      areas: (areas.data || []).map(
        (row): Area => ({ id: row.id, name: row.name }),
      ),
    };
  },

  getEditAttentionCatalogs: async (): Promise<NewAttentionCatalogs> => {
    const [channels, types, topics, kinships, areas] = await Promise.all([
      supabase.from("service_channels").select("id,name,detail,is_active,disabled_by_name,disabled_at").order("name"),
      supabase.from("consultation_types").select("id,name,display_order,is_active").order("display_order"),
      supabase.from("consultation_topics").select("id,consultation_type_id,name,display_order,requires_absence_count,is_active").order("display_order"),
      supabase.from("kinship_types").select("id,name,display_order,is_active").order("display_order"),
      supabase.from("areas").select("id,name").order("name"),
    ]);
    const firstError = [channels, types, topics, kinships, areas].find((result) => result.error)?.error;
    if (firstError) throw new Error(getErrorMessage(firstError));

    return {
      serviceChannels: (channels.data || []).map((row) => ({ id: row.id, name: row.name, detail: row.detail, isActive: row.is_active, disabledByName: row.disabled_by_name, disabledAt: row.disabled_at })),
      consultationTypes: (types.data || []).map((row) => ({ id: row.id, name: row.name, displayOrder: row.display_order, isActive: row.is_active })),
      consultationTopics: (topics.data || []).map((row) => ({ id: row.id, consultationTypeId: row.consultation_type_id, name: row.name, displayOrder: row.display_order, requiresAbsenceCount: row.requires_absence_count, isActive: row.is_active })),
      kinshipTypes: (kinships.data || []).map((row) => ({ id: row.id, name: row.name, displayOrder: row.display_order, isActive: row.is_active })),
      areas: (areas.data || []).map((row) => ({ id: row.id, name: row.name })),
    };
  },

  create: async (
    values: CreateCustomerAttentionInput,
  ): Promise<CreatedCustomerAttention> => {
    const { data, error } = await supabase.rpc("create_customer_attention", {
      p_client: {
        dni: values.client.dni,
        first_name: values.client.firstName,
        middle_name: values.client.middleName || null,
        paternal_surname: values.client.paternalSurname,
        maternal_surname: values.client.maternalSurname,
        email: values.client.email || null,
        phone: values.client.phone || null,
      },
      p_service_channel_id: values.serviceChannelId,
      p_requester_type: values.requesterType,
      p_conclusion: values.conclusion.trim(),
      p_topics: values.topics.map((topic) => ({
        topic_id: topic.topicId,
        absence_count: topic.absenceCount,
      })),
      p_kinship_type_id: values.kinshipTypeId || null,
      p_destination_area_id: values.destinationAreaId || null,
    });

    if (error) throw new Error(getErrorMessage(error));

    const result = data as { id?: unknown; rac_code?: unknown } | null;
    if (typeof result?.id !== "string" || typeof result.rac_code !== "string") {
      throw new Error("Supabase no devolvió el código de la atención creada.");
    }

    return { id: result.id, racCode: result.rac_code };
  },

  update: async (values: UpdateCustomerAttentionInput): Promise<void> => {
    const { error } = await supabase.rpc("update_customer_attention", {
      p_attention_id: values.id,
      p_client: {
        first_name: values.client.firstName,
        middle_name: values.client.middleName || null,
        paternal_surname: values.client.paternalSurname,
        maternal_surname: values.client.maternalSurname,
        email: values.client.email || null,
        phone: values.client.phone || null,
      },
      p_service_channel_id: values.serviceChannelId,
      p_requester_type: values.requesterType,
      p_conclusion: values.conclusion.trim(),
      p_topics: values.topics.map((topic) => ({ topic_id: topic.topicId, absence_count: topic.absenceCount })),
      p_kinship_type_id: values.kinshipTypeId || null,
      p_destination_area_id: values.destinationAreaId || null,
    });
    if (error) throw new Error(getErrorMessage(error));
  },

  disable: async ({ id, reason }: { id: string; reason: string }): Promise<void> => {
    const { error } = await supabase.rpc("disable_customer_attention", {
      p_attention_id: id,
      p_reason: reason.trim(),
    });
    if (error) throw new Error(getErrorMessage(error));
  },

  concludeReferral: async ({ id, conclusion }: { id: string; conclusion: string }): Promise<void> => {
    const { error } = await supabase.rpc("conclude_attention_referral", {
      p_referral_id: id,
      p_conclusion: conclusion.trim(),
    });
    if (error) throw new Error(getErrorMessage(error));
  },
};
