import { supabase } from "../supabase/config";
import type { SurveyChannel, SurveyResponse, SurveyStatus, TabletBinding, TabletSurvey } from "../types";

const unwrap = <T>(value: unknown) => value as T | null;
const fail = (error: { message?: string } | null) => {
  if (error) throw new Error(error.message || "No se pudo completar la operación.");
};

export type AttentionSurveyState = {
  status: Exclude<SurveyStatus, "NONE">;
  channel: SurveyChannel;
  recipientEmail: string | null;
  expiresAt: string | null;
};

export type PublicSurveyState = {
  state: "OPEN" | "INVALID" | "EXPIRED" | "CLOSED" | "PENDING_DELIVERY";
  racCode?: string;
  expiresAt?: string;
  surveyKind?: "ATTENTION" | "REFERRAL";
};

export type PublicSurveyResult = {
  result: "COMPLETED" | "SKIPPED" | "INVALID" | "EXPIRED" | "CLOSED" | "INVALID_RESPONSE";
};

const invokePublicSurvey = async <T>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke("public-survey", { body });
  if (error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { message?: string };
        if (payload.message) throw new Error(payload.message);
      } catch (responseError) {
        if (responseError instanceof Error && responseError.message !== "Unexpected end of JSON input") throw responseError;
      }
    }
    throw new Error(error.message || "No se pudo completar la operación.");
  }
  return data as T;
};

export const surveysApi = {
  getOperatorPending: async (): Promise<{
    attentionId: string;
    racCode: string;
    status: "PENDING_DECISION" | "SENT";
    channel: SurveyChannel;
  } | null> => {
    const { data, error } = await supabase.rpc("get_current_operator_survey"); fail(error);
    return unwrap(data);
  },
  getState: async (attentionId: string): Promise<AttentionSurveyState | null> => {
    const { data, error } = await supabase.rpc("get_attention_survey_state", { p_attention_id: attentionId }); fail(error);
    return unwrap(data);
  },
  send: async (attentionId: string) => {
    const { error } = await supabase.rpc("send_attention_survey", { p_attention_id: attentionId }); fail(error);
  },
  sendByEmail: async (attentionId: string, email: string): Promise<AttentionSurveyState> => {
    const { data, error } = await supabase.rpc("queue_attention_email_survey", { p_attention_id: attentionId, p_email: email }); fail(error);
    const state = unwrap<AttentionSurveyState>(data);
    if (!state) throw new Error("Supabase no devolvió el estado de la encuesta.");
    return state;
  },
  skipByOperator: async (attentionId: string) => {
    const { error } = await supabase.rpc("skip_attention_survey", { p_attention_id: attentionId }); fail(error);
  },
  getBinding: async (): Promise<TabletBinding | null> => {
    const { data, error } = await supabase.rpc("get_current_tablet_binding"); fail(error);
    return unwrap<TabletBinding>(data);
  },
  activate: async (): Promise<TabletBinding> => {
    const { data, error } = await supabase.rpc("activate_tablet_binding"); fail(error);
    const binding = unwrap<TabletBinding>(data);
    if (!binding) throw new Error("Supabase no devolvió la vinculación de la tablet.");
    return binding;
  },
  deactivate: async () => {
    const { error } = await supabase.rpc("deactivate_current_tablet", { p_reason: "Cierre de sesión en tablet" }); fail(error);
  },
  getCurrent: async (): Promise<TabletSurvey | null> => {
    const { data, error } = await supabase.rpc("get_current_tablet_survey"); fail(error);
    return unwrap<TabletSurvey>(data);
  },
  answer: async (surveyId: string, response: SurveyResponse) => {
    const { error } = await supabase.rpc("answer_tablet_survey", { p_survey_id: surveyId, p_response: response }); fail(error);
  },
  skipFromTablet: async (surveyId: string) => {
    const { error } = await supabase.rpc("skip_tablet_survey", { p_survey_id: surveyId }); fail(error);
  },
  getPublic: (token: string) => invokePublicSurvey<PublicSurveyState>({ action: "get", token }),
  respondPublic: (token: string, response: SurveyResponse | null, skip = false) =>
    invokePublicSurvey<PublicSurveyResult>({ action: "respond", token, response, skip }),
};
