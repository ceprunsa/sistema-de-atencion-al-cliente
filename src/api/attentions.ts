import { supabase } from "../supabase/config";
import type { Database } from "../supabase/types";
import type {
  Area,
  AdmissionProcess,
  AttentionCreationOrigin,
  AttentionRegistrationState,
  AttentionListItem,
  Client,
  ClientLookupResult,
  ConsultationTopic,
  ConsultationType,
  ConcludeReferralResult,
  CreatedCustomerAttention,
  CustomerAttentionDetail,
  CreateCustomerAttentionInput,
  EmailAttentionDuplicate,
  EmailAttachmentMetadata,
  KinshipType,
  NewAttentionCatalogs,
  PaginatedResponse,
  ReferralSurvey,
  ServiceChannel,
  UpdateCustomerAttentionInput,
} from "../types";

type ReferralDetailRow = Database["public"]["Tables"]["attention_referrals"]["Row"] & {
  referral_surveys:
    | Database["public"]["Tables"]["referral_surveys"]["Row"]
    | Array<Database["public"]["Tables"]["referral_surveys"]["Row"]>
    | null;
};

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
    | ReferralDetailRow
    | Array<ReferralDetailRow>
    | null;
  attention_surveys:
    | Database["public"]["Tables"]["attention_surveys"]["Row"]
    | Array<Database["public"]["Tables"]["attention_surveys"]["Row"]>
    | null;
  attention_admission_processes: Array<{
    admission_processes: Database["public"]["Tables"]["admission_processes"]["Row"] | null;
  }>;
};

const mapAdmissionProcess = (row: Database["public"]["Tables"]["admission_processes"]["Row"]): AdmissionProcess => ({
  id: row.id,
  phase: row.phase as AdmissionProcess["phase"],
  customLabel: row.custom_label,
  year: row.year,
  isActive: row.is_active,
});

type ClientRow = DatabaseClientRow;
type DatabaseClientRow = {
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

const mapClient = (row: ClientRow): Client => ({
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

const mapEmailAttachments = (value: Database["public"]["Tables"]["customer_attentions"]["Row"]["email_attachments"]): EmailAttachmentMetadata[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const name = typeof item.name === "string" ? item.name : "";
    if (!name) return [];
    return [{
      name,
      sizeLabel: typeof item.sizeLabel === "string" ? item.sizeLabel : null,
      typeLabel: typeof item.typeLabel === "string" ? item.typeLabel : null,
    }];
  });
};

const getErrorMessage = (error: { code?: string; message?: string }) => {
  if (error.code === "PGRST202") {
    return "La función requerida no está instalada. Ejecuta los SQL 03 y 04 en Supabase.";
  }
  return error.message || "No se pudo completar la operación.";
};

export const attentionsApi = {
  getRegistrationState: async (): Promise<AttentionRegistrationState> => {
    const { data, error } = await supabase.rpc("get_my_attention_registration_state");
    if (error?.code === "PGRST202") {
      throw new Error("La verificación de mesa no está instalada. Ejecuta el SQL 11 en Supabase.");
    }
    if (error) throw new Error(getErrorMessage(error));

    const state = data as {
      allowed?: unknown;
      reason?: unknown;
      workstationId?: unknown;
      workstationName?: unknown;
    } | null;
    if (!state || typeof state.allowed !== "boolean") {
      throw new Error("Supabase no devolvió un estado válido para el registro de atenciones.");
    }

    return {
      allowed: state.allowed,
      reason: typeof state.reason === "string"
        ? state.reason as AttentionRegistrationState["reason"]
        : null,
      workstationId: typeof state.workstationId === "string" ? state.workstationId : null,
      workstationName: typeof state.workstationName === "string" ? state.workstationName : null,
    };
  },

  list: async (
    page: number,
    limit: number,
    search: string,
    surveyStatus?: string,
    referralStatus?: string,
    areaId?: string,
    admissionProcessId?: string,
  ): Promise<PaginatedResponse<AttentionListItem>> => {
    const { data, error } = await supabase.rpc("list_customer_attentions_v3", {
      p_page: page,
      p_limit: limit,
      p_search: search.trim(),
      p_survey_status: surveyStatus || null,
      p_referral_status: referralStatus || null,
      p_area_id: areaId || null,
      p_admission_process_id: admissionProcessId || null,
    });
    if (error?.code === "PGRST202") {
      throw new Error("El filtro de procesos no está instalado. Ejecuta el SQL 13 en Supabase.");
    }
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
        "*,clients(*),service_channels(*),kinship_types(name),attention_topics(consultation_topics(id,name,consultation_types(name))),attention_admission_processes(admission_processes(*)),attention_referrals(*,referral_surveys(id,status,response,recipient_email,token_expires_at,sent_at,completed_at,closed_reason,closed_at)),attention_surveys(id,status,channel,response,recipient_email,token_expires_at,sent_at,completed_at,closed_reason,closed_at)",
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
    const referralSurvey = referral
      ? (Array.isArray(referral.referral_surveys)
          ? referral.referral_surveys[0]
          : referral.referral_surveys)
      : null;
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
      creationOrigin: row.creation_origin as AttentionCreationOrigin,
      emailReceivedAt: row.email_received_at,
      emailRespondedAt: row.email_responded_at,
      emailOriginalText: row.email_original_text,
      emailAttachments: mapEmailAttachments(row.email_attachments),
      sourceMessageKeyHash: row.source_message_key_hash,
      sourceFingerprint: row.source_fingerprint,
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
        category: row.service_channels.category as ServiceChannel["category"],
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
            survey: referralSurvey
              ? {
                  id: referralSurvey.id,
                  status: referralSurvey.status as ReferralSurvey["status"],
                  response: referralSurvey.response as NonNullable<NonNullable<CustomerAttentionDetail["referral"]>["survey"]>["response"],
                  recipientEmail: referralSurvey.recipient_email,
                  expiresAt: referralSurvey.token_expires_at,
                  sentAt: referralSurvey.sent_at,
                  completedAt: referralSurvey.completed_at,
                  closedReason: referralSurvey.closed_reason,
                  closedAt: referralSurvey.closed_at,
                }
              : null,
          }
        : null,
      survey: survey
        ? {
            id: survey.id,
            status: survey.status as NonNullable<CustomerAttentionDetail["survey"]>["status"],
            channel: survey.channel as NonNullable<CustomerAttentionDetail["survey"]>["channel"],
            response: survey.response as NonNullable<CustomerAttentionDetail["survey"]>["response"],
            recipientEmail: survey.recipient_email,
            expiresAt: survey.token_expires_at,
            sentAt: survey.sent_at,
            completedAt: survey.completed_at,
            closedReason: survey.closed_reason,
            closedAt: survey.closed_at,
          }
        : null,
      admissionProcesses: row.attention_admission_processes
        .filter((item) => item.admission_processes)
        .map((item) => mapAdmissionProcess(item.admission_processes!)),
    };
  },

  findClientByDni: async (dni: string): Promise<ClientLookupResult> => {
    const { data, error } = await supabase
      .from("clients")
      .select(
        "id,dni,display_name,first_name,middle_name,paternal_surname,maternal_surname,email,phone,created_at,updated_at",
      )
      .eq("dni", dni)
      .maybeSingle();

    if (error) throw new Error(getErrorMessage(error));
    if (data) return { source: "LOCAL", client: mapClient(data as ClientRow) };

    const { data: externalData, error: externalError } = await supabase.functions.invoke(
      "dni-lookup",
      { body: { dni } },
    );
    if (externalError) {
      let message = "No se pudo consultar el DNI.";
      const context = (externalError as { context?: unknown }).context;
      if (context instanceof Response) {
        try {
          const body = await context.clone().json() as { message?: unknown };
          if (typeof body.message === "string" && body.message.trim()) message = body.message;
        } catch {
          // El mensaje genérico permite continuar manualmente si la respuesta no trae JSON.
        }
      }
      throw new Error(message);
    }

    const result = externalData as {
      status?: unknown;
      source?: unknown;
      message?: unknown;
      client?: ClientRow;
      person?: {
        firstName?: unknown;
        middleName?: unknown;
        paternalSurname?: unknown;
        maternalSurname?: unknown;
      };
    } | null;
    if (result?.status === "FOUND" && result.source === "LOCAL" && result.client) {
      return { source: "LOCAL", client: mapClient(result.client) };
    }
    if (
      result?.status === "FOUND"
      && result.source === "EXTERNAL"
      && typeof result.person?.firstName === "string"
      && (typeof result.person.middleName === "string" || result.person.middleName === null)
      && typeof result.person.paternalSurname === "string"
      && typeof result.person.maternalSurname === "string"
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
        message: typeof result.message === "string"
          ? result.message
          : "No se encontraron datos. Ingresa la información manualmente.",
      };
    }
    throw new Error("El servicio de consulta DNI devolvió una respuesta no reconocida.");
  },

  findClientsByEmail: async (email: string): Promise<Client[]> => {
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase
      .from("clients")
      .select("id,dni,display_name,first_name,middle_name,paternal_surname,maternal_surname,email,phone,created_at,updated_at")
      .eq("email", normalizedEmail)
      .order("updated_at", { ascending: false });
    if (error?.code === "PGRST202") {
      throw new Error("El flujo flexible de clientes no está instalado. Ejecuta el SQL 12 en Supabase.");
    }
    if (error) throw new Error(getErrorMessage(error));
    return ((data || []) as DatabaseClientRow[]).map(mapClient);
  },

  getNewAttentionCatalogs: async (): Promise<NewAttentionCatalogs> => {
    const [channels, types, topics, kinships, areas, admissionProcesses] = await Promise.all([
      supabase
        .from("service_channels")
        .select("id,name,detail,category,is_active,disabled_by_name,disabled_at")
        .eq("is_active", true)
        .not("category", "is", null)
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
      supabase.from("areas").select("id,name,group_email").order("name"),
      supabase.from("admission_processes").select("id,phase,custom_label,year,is_active,created_at,updated_at").eq("is_active", true).order("year", { ascending: false }),
    ]);

    const firstError = [channels, types, topics, kinships, areas, admissionProcesses].find(
      (result) => result.error,
    )?.error;
    if (firstError) throw new Error(getErrorMessage(firstError));

    return {
      serviceChannels: (channels.data || []).map(
        (row): ServiceChannel => ({
          id: row.id,
          name: row.name,
          detail: row.detail,
          category: row.category as ServiceChannel["category"],
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
        (row): Area => ({ id: row.id, name: row.name, groupEmail: row.group_email }),
      ),
      admissionProcesses: (admissionProcesses.data || []).map(mapAdmissionProcess),
    };
  },

  getEditAttentionCatalogs: async (): Promise<NewAttentionCatalogs> => {
    const [channels, types, topics, kinships, areas, admissionProcesses] = await Promise.all([
      supabase.from("service_channels").select("id,name,detail,category,is_active,disabled_by_name,disabled_at").order("name"),
      supabase.from("consultation_types").select("id,name,display_order,is_active").order("display_order"),
      supabase.from("consultation_topics").select("id,consultation_type_id,name,display_order,is_active").order("display_order"),
      supabase.from("kinship_types").select("id,name,display_order,is_active").order("display_order"),
      supabase.from("areas").select("id,name,group_email").order("name"),
      supabase.from("admission_processes").select("id,phase,custom_label,year,is_active,created_at,updated_at").order("year", { ascending: false }),
    ]);
    const firstError = [channels, types, topics, kinships, areas, admissionProcesses].find((result) => result.error)?.error;
    if (firstError) throw new Error(getErrorMessage(firstError));

    return {
      serviceChannels: (channels.data || []).map((row) => ({ id: row.id, name: row.name, detail: row.detail, category: row.category as ServiceChannel["category"], isActive: row.is_active, disabledByName: row.disabled_by_name, disabledAt: row.disabled_at })),
      consultationTypes: (types.data || []).map((row) => ({ id: row.id, name: row.name, displayOrder: row.display_order, isActive: row.is_active })),
      consultationTopics: (topics.data || []).map((row) => ({ id: row.id, consultationTypeId: row.consultation_type_id, name: row.name, displayOrder: row.display_order, isActive: row.is_active })),
      kinshipTypes: (kinships.data || []).map((row) => ({ id: row.id, name: row.name, displayOrder: row.display_order, isActive: row.is_active })),
      areas: (areas.data || []).map((row) => ({ id: row.id, name: row.name, groupEmail: row.group_email })),
      admissionProcesses: (admissionProcesses.data || []).map(mapAdmissionProcess),
    };
  },

  create: async (
    values: CreateCustomerAttentionInput,
  ): Promise<CreatedCustomerAttention> => {
    const { data, error } = await supabase.rpc("create_customer_attention_v4", {
      p_client: {
        id: values.client.id || null,
        create_new: values.client.createNew === true,
        dni: values.client.dni || null,
        display_name: values.client.displayName,
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
      p_client_contact_email: values.client.email || null,
      p_admission_process_ids: values.admissionProcessIds,
      p_kinship_type_id: values.kinshipTypeId || null,
      p_destination_area_id: values.destinationAreaId || null,
      p_requester_detail: values.requesterDetail || null,
      p_kinship_detail: values.kinshipDetail || null,
      p_creation_origin: values.creationOrigin || "WEB",
      p_email_received_at: values.emailReceivedAt || null,
      p_email_responded_at: values.emailRespondedAt || null,
      p_email_original_text: values.emailOriginalText || null,
      p_email_attachments: (values.emailAttachments || []).map((attachment) => ({
        name: attachment.name,
        sizeLabel: attachment.sizeLabel ?? null,
        typeLabel: attachment.typeLabel ?? null,
      })),
      p_source_message_key_hash: values.sourceMessageKeyHash || null,
      p_source_fingerprint: values.sourceFingerprint || null,
    });

    if (error?.code === "PGRST202") {
      throw new Error("Los metadatos de correo no están instalados. Ejecuta el SQL 16 en Supabase.");
    }
    if (error) throw new Error(getErrorMessage(error));

    const result = data as { id?: unknown; rac_code?: unknown } | null;
    if (typeof result?.id !== "string" || typeof result.rac_code !== "string") {
      throw new Error("Supabase no devolvió el código de la atención creada.");
    }

    return { id: result.id, racCode: result.rac_code };
  },

  findEmailDuplicates: async ({
    messageKeyHash,
    fingerprint,
  }: {
    messageKeyHash: string | null;
    fingerprint: string | null;
  }): Promise<EmailAttentionDuplicate[]> => {
    const { data, error } = await supabase.rpc("find_email_attention_duplicates", {
      p_source_message_key_hash: messageKeyHash,
      p_source_fingerprint: fingerprint,
    });
    if (error?.code === "PGRST202") {
      throw new Error("La verificación de correos duplicados no está instalada. Ejecuta el SQL 16 en Supabase.");
    }
    if (error) throw new Error(getErrorMessage(error));
    const matches = (data || []).flatMap((row) => {
      if (row.match_type !== "MESSAGE_KEY" && row.match_type !== "FINGERPRINT") return [];
      return [{
        id: row.id,
        racCode: row.rac_code,
        createdAt: row.created_at,
        matchType: row.match_type as EmailAttentionDuplicate["matchType"],
      }];
    });
    return [...new Map(matches.map((match) => [match.id, match])).values()];
  },

  update: async (values: UpdateCustomerAttentionInput): Promise<void> => {
    const { error } = await supabase.rpc("update_customer_attention_v4", {
      p_attention_id: values.id,
      p_client: {
        dni: values.client.dni || null,
        display_name: values.client.displayName,
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
      p_admission_process_ids: values.admissionProcessIds,
      p_kinship_type_id: values.kinshipTypeId || null,
      p_destination_area_id: values.destinationAreaId || null,
      p_requester_detail: values.requesterDetail || null,
      p_kinship_detail: values.kinshipDetail || null,
      p_email_received_at: values.emailReceivedAt || null,
      p_email_responded_at: values.emailRespondedAt || null,
    });
    if (error?.code === "PGRST202") {
      throw new Error("Los metadatos de correo no están instalados. Ejecuta el SQL 16 en Supabase.");
    }
    if (error) throw new Error(getErrorMessage(error));
  },

  setEmailResponseAt: async ({ id, respondedAt }: { id: string; respondedAt: string | null }): Promise<void> => {
    const { error } = await supabase.rpc("set_email_attention_response_at", {
      p_attention_id: id,
      p_responded_at: respondedAt,
    });
    if (error?.code === "PGRST202") {
      throw new Error("La actualización limitada de respuesta no está instalada. Ejecuta el SQL 16 en Supabase.");
    }
    if (error) throw new Error(getErrorMessage(error));
  },

  disable: async ({ id, reason }: { id: string; reason: string }): Promise<void> => {
    const { error } = await supabase.rpc("disable_customer_attention", {
      p_attention_id: id,
      p_reason: reason.trim(),
    });
    if (error) throw new Error(getErrorMessage(error));
  },

  concludeReferral: async ({ id, conclusion }: { id: string; conclusion: string }): Promise<ConcludeReferralResult> => {
    const { data, error } = await supabase.rpc("conclude_attention_referral", {
      p_referral_id: id,
      p_conclusion: conclusion.trim(),
    });
    if (error) throw new Error(getErrorMessage(error));
    return data as unknown as ConcludeReferralResult;
  },
};
