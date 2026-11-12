import { supabase } from "../supabase/config";
import type {
  ComplaintAttentionMatch,
  ComplaintClosureReviewInput,
  ComplaintClosureReviewResult,
  ComplaintDetail,
  ComplaintListItem,
  ComplaintListScope,
  ComplaintManagementInput,
  ComplaintManagementResult,
  ComplaintSacDecisionInput,
  ComplaintSacDecisionResult,
  ComplaintStatus,
  CreateComplaintInput,
  CreatedComplaint,
  NewComplaintCatalogs,
  PaginatedResponse,
  PublicComplaintResponseResult,
  PublicComplaintResponseState,
  ServiceChannel,
} from "../types";

const getErrorMessage = (error: { code?: string; message?: string }) => {
  if (error.code === "PGRST202" || error.code === "42703") {
    return "El módulo de quejas no está actualizado. Ejecuta manualmente los SQL 20, 21, 22, 23, 24 y 25 en Supabase.";
  }
  return error.message || "No se pudo completar la operación.";
};

export const complaintsApi = {
  getCreationCatalogs: async (): Promise<NewComplaintCatalogs> => {
    const [channels, areas, closureArea, access] = await Promise.all([
      supabase
        .from("service_channels")
        .select("id,name,detail,category,is_active,disabled_by_name,disabled_at")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("areas")
        .select("id,name,group_email,is_active")
        .eq("is_active", true)
        .order("name"),
      supabase.rpc("get_complaint_closure_area"),
      supabase.rpc("can_create_complaints"),
    ]);

    const firstError = [channels, areas, closureArea, access].find(
      (result) => result.error,
    )?.error;
    if (firstError) throw new Error(getErrorMessage(firstError));

    const closure = closureArea.data?.[0];
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
      responsibleAreas: (areas.data || []).map((row) => ({
        id: row.id,
        name: row.name,
        groupEmail: row.group_email || "",
      })),
      closureArea: closure
        ? {
            id: closure.area_id,
            name: closure.area_name,
            groupEmail: closure.group_email || "",
          }
        : null,
      canCreate: access.data === true,
    };
  },

  findAttention: async (
    racCode: string,
  ): Promise<ComplaintAttentionMatch | null> => {
    const { data, error } = await supabase.rpc(
      "find_attention_for_complaint",
      { p_rac_code: racCode.trim().toUpperCase() },
    );
    if (error) throw new Error(getErrorMessage(error));
    const row = data?.[0];
    if (!row) return null;
    return {
      attentionId: row.attention_id,
      racCode: row.rac_code,
      attentionCreatedAt: row.attention_created_at,
      client: {
        id: row.client_id,
        dni: row.client_dni,
        displayName: row.client_display_name,
        firstName: row.client_first_name,
        middleName: row.client_middle_name,
        paternalSurname: row.client_paternal_surname,
        maternalSurname: row.client_maternal_surname,
        email: row.client_email,
        phone: row.client_phone,
        createdAt: row.client_created_at,
        updatedAt: row.client_updated_at,
      },
    };
  },

  create: async (values: CreateComplaintInput): Promise<CreatedComplaint> => {
    const { data, error } = await supabase.rpc("create_complaint", {
      p_request_id: values.requestId,
      p_client: {
        id: values.client.id || null,
        dni: values.client.dni,
        first_name: values.client.firstName,
        middle_name: values.client.middleName || null,
        paternal_surname: values.client.paternalSurname,
        maternal_surname: values.client.maternalSurname,
        email: values.client.email,
        phone: values.client.phone || null,
      },
      p_attention_id: values.attentionId || null,
      p_service_channel_id: values.serviceChannelId,
      p_responsible_area_id: values.responsibleAreaId,
      p_description: values.description.trim(),
    });
    if (error) throw new Error(getErrorMessage(error));

    const result = data as {
      id?: unknown;
      complaint_code?: unknown;
      notification_queued?: unknown;
      reused_request?: unknown;
    } | null;
    if (
      typeof result?.id !== "string"
      || typeof result.complaint_code !== "string"
    ) {
      throw new Error("Supabase no devolvió el código de la queja creada.");
    }
    return {
      id: result.id,
      complaintCode: result.complaint_code,
      notificationQueued: result.notification_queued === true,
      reusedRequest: result.reused_request === true,
    };
  },

  list: async (
    page: number,
    limit: number,
    search: string,
    status: ComplaintStatus | "",
    areaId: string,
    scope: ComplaintListScope,
  ): Promise<PaginatedResponse<ComplaintListItem>> => {
    const { data, error } = await supabase.rpc("list_complaints", {
      p_page: page,
      p_limit: limit,
      p_search: search.trim(),
      p_status: status || null,
      p_area_id: areaId || null,
      p_scope: scope,
    });
    if (error) throw new Error(getErrorMessage(error));
    const rows = data || [];
    const total = Number(rows[0]?.total_count || 0);
    return {
      data: rows.map((row) => ({
        id: row.id,
        complaintCode: row.complaint_code,
        status: row.complaint_status as ComplaintStatus,
        descriptionPreview: row.description_preview,
        clientId: row.client_id,
        clientDni: row.client_dni,
        clientName: row.client_name,
        clientEmail: row.client_email,
        attentionId: row.attention_id,
        racCode: row.rac_code,
        serviceChannelName: row.service_channel_name,
        responsibleAreaId: row.responsible_area_id,
        responsibleAreaName: row.responsible_area_name,
        closureAreaId: row.closure_area_id,
        closureAreaName: row.closure_area_name,
        createdById: row.created_by,
        createdByName: row.created_by_name,
        createdAt: row.created_at,
        isCreator: row.is_creator,
        canManageResponsible: row.can_manage_responsible,
        canManageClosure: row.can_manage_closure,
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  getById: async (id: string): Promise<ComplaintDetail> => {
    const { data, error } = await supabase.rpc("get_complaint_detail", {
      p_complaint_id: id,
    });
    if (error) throw new Error(getErrorMessage(error));
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Supabase no devolvió un detalle de queja válido.");
    }
    return data as unknown as ComplaintDetail;
  },

  getPendingCount: async (): Promise<number> => {
    const { data, error } = await supabase.rpc(
      "get_pending_complaint_count",
    );
    if (error) throw new Error(getErrorMessage(error));
    return Math.max(0, Number(data || 0));
  },

  startManagement: async (complaintId: string): Promise<void> => {
    const { error } = await supabase.rpc("start_complaint_management", {
      p_complaint_id: complaintId,
    });
    if (error) throw new Error(getErrorMessage(error));
  },

  submitManagement: async (
    complaintId: string,
    values: ComplaintManagementInput,
  ): Promise<ComplaintManagementResult> => {
    const { data, error } = await supabase.rpc("submit_complaint_management", {
      p_complaint_id: complaintId,
      p_proceeds: values.proceeds,
      p_analysis: values.analysis.trim(),
      p_actions: values.actions.trim(),
      p_client_explanation: values.clientExplanation?.trim() || null,
    });
    if (error) throw new Error(getErrorMessage(error));
    return data as unknown as ComplaintManagementResult;
  },

  reviewClosure: async (
    complaintId: string,
    values: ComplaintClosureReviewInput,
  ): Promise<ComplaintClosureReviewResult> => {
    const { data, error } = await supabase.rpc("review_complaint_closure", {
      p_complaint_id: complaintId,
      p_is_adequate: values.isAdequate,
      p_observations: values.observations.trim(),
    });
    if (error) throw new Error(getErrorMessage(error));
    return data as unknown as ComplaintClosureReviewResult;
  },

  decideSac: async (
    complaintId: string,
    values: ComplaintSacDecisionInput,
  ): Promise<ComplaintSacDecisionResult> => {
    const { data, error } = await supabase.rpc("decide_complaint_sac", {
      p_complaint_id: complaintId,
      p_should_create_sac: values.shouldCreateSac,
      p_comments: values.comments.trim(),
    });
    if (error) throw new Error(getErrorMessage(error));
    return data as unknown as ComplaintSacDecisionResult;
  },
};

const invokePublicComplaint = async <T>(
  body: Record<string, unknown>,
): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(
    "public-complaint-response",
    { body },
  );
  if (error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { message?: string };
        if (payload.message) throw new Error(payload.message);
      } catch (responseError) {
        if (
          responseError instanceof Error
          && responseError.message !== "Unexpected end of JSON input"
        ) throw responseError;
      }
    }
    throw new Error(error.message || "No se pudo completar la operación.");
  }
  return data as T;
};

export const publicComplaintResponseApi = {
  get: (token: string) => invokePublicComplaint<PublicComplaintResponseState>({
    action: "get",
    token,
  }),
  respond: (token: string, agreed: boolean, disagreementReason?: string) =>
    invokePublicComplaint<PublicComplaintResponseResult>({
      action: "respond",
      token,
      agreed,
      disagreementReason: agreed ? null : disagreementReason?.trim(),
    }),
};
