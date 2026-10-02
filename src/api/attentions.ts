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

type DetailRow = Database["public"]["Tables"]["customer_attentions"]["Row"] & {
  clients: DatabaseClientRow | null;
  service_channels: Database["public"]["Tables"]["service_channels"]["Row"] | null;
  kinship_types: { name: string } | null;
  attention_topics: Array<{
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
  attention_surveys:
    | Database["public"]["Tables"]["attention_surveys"]["Row"]
    | Array<Database["public"]["Tables"]["attention_surveys"]["Row"]>
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

const getErrorMessage = (error: { code?: string; message?: string }) => {
  if (error.code === "PGRST202") {
    return "La función requerida no está instalada. Ejecuta los SQL 03 y 04 en Supabase.";
  }
  return error.message || "No se pudo completar la operación.";
};

export const attentionsApi = {
  list: async (
    page: number,
    limit: number,
    search: string,
    surveyStatus?: string,
    referralStatus?: string,
    areaId?: string,
  ): Promise<PaginatedResponse<AttentionListItem>> => {
    const { data, error } = await supabase.rpc("list_customer_attentions_v2", {
      p_page: page,
      p_limit: limit,
      p_search: search.trim(),
      p_survey_status: surveyStatus || null,
      p_referral_status: referralStatus || null,
      p_area_id: areaId || null,
    });
    if (error) throw new Error(getErrorMessage(error));
    const rows = data || [];
    const total = Number(rows[0]?.total_count || 0);
    return {
      data: rows.map((row) => ({
        id: row.id,
        racCode: row.rac_code,
        status: row.attention_status as AttentionListItem["status"],
        requesterType: row.requester_type as AttentionListItem["requesterType"],
        clientDni: row.client_dni,
        clientName: row.client_name,
        serviceChannelName: row.service_channel_name,
        createdByName: row.created_by_name,
        createdAt: row.created_at,
        surveyStatus: row.survey_status as AttentionListItem["surveyStatus"],
        referralStatus: row.referral_status as AttentionListItem["referralStatus"],
        referralAreaId: row.referral_area_id,
        referralAreaName: row.referral_area_name,
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
        "*,clients(*),service_channels(*),kinship_types(name),attention_topics(consultation_topics(id,name,consultation_types(name))),attention_referrals(*),attention_surveys(*)",
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
    const survey = Array.isArray(row.attention_surveys)
      ? row.attention_surveys[0]
      : row.attention_surveys;
    return {
      id: row.id,
      racYear: row.rac_year,
      racNumber: row.rac_number,
      racCode: row.rac_code,
      clientId: row.client_id,
      serviceChannelId: row.service_channel_id,
      requesterType: row.requester_type as CustomerAttentionDetail["requesterType"],
      kinshipTypeId: row.kinship_type_id,
      requesterDetail: row.requester_detail,
      kinshipDetail: row.kinship_detail,
      conclusion: row.conclusion,
      status: row.status as CustomerAttentionDetail["status"],
      createdById: row.created_by,
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
            sourceAreaId: referral.source_area_id,
            sourceAreaName: referral.source_area_name,
            status: referral.status as NonNullable<CustomerAttentionDetail["referral"]>["status"],
            disabledReason: referral.disabled_reason,
            disabledByName: referral.disabled_by_name,
            disabledAt: referral.disabled_at,
            cancelledReason: referral.cancelled_reason,
            cancelledByName: referral.cancelled_by_name,
            cancelledAt: referral.cancelled_at,
          }
        : null,
      survey: survey
        ? {
            id: survey.id,
            status: survey.status as NonNullable<CustomerAttentionDetail["survey"]>["status"],
            response: survey.response as NonNullable<CustomerAttentionDetail["survey"]>["response"],
            sentAt: survey.sent_at,
            completedAt: survey.completed_at,
            closedReason: survey.closed_reason,
            closedAt: survey.closed_at,
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
          "id,consultation_type_id,name,display_order,is_active",
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
      supabase.from("consultation_topics").select("id,consultation_type_id,name,display_order,is_active").order("display_order"),
      supabase.from("kinship_types").select("id,name,display_order,is_active").order("display_order"),
      supabase.from("areas").select("id,name").order("name"),
    ]);
    const firstError = [channels, types, topics, kinships, areas].find((result) => result.error)?.error;
    if (firstError) throw new Error(getErrorMessage(firstError));

    return {
      serviceChannels: (channels.data || []).map((row) => ({ id: row.id, name: row.name, detail: row.detail, isActive: row.is_active, disabledByName: row.disabled_by_name, disabledAt: row.disabled_at })),
      consultationTypes: (types.data || []).map((row) => ({ id: row.id, name: row.name, displayOrder: row.display_order, isActive: row.is_active })),
      consultationTopics: (topics.data || []).map((row) => ({ id: row.id, consultationTypeId: row.consultation_type_id, name: row.name, displayOrder: row.display_order, isActive: row.is_active })),
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
      p_topics: values.topics.map((topic) => ({ topic_id: topic.topicId })),
      p_kinship_type_id: values.kinshipTypeId || null,
      p_destination_area_id: values.destinationAreaId || null,
      p_requester_detail: values.requesterDetail || null,
      p_kinship_detail: values.kinshipDetail || null,
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
      p_topics: values.topics.map((topic) => ({ topic_id: topic.topicId })),
      p_kinship_type_id: values.kinshipTypeId || null,
      p_destination_area_id: values.destinationAreaId || null,
      p_requester_detail: values.requesterDetail || null,
      p_kinship_detail: values.kinshipDetail || null,
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
