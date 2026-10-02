import { supabase } from "../supabase/config";
import type { SurveyResponse, TabletBinding, TabletSurvey } from "../types";

const unwrap = <T>(value: unknown) => value as T | null;
const fail = (error: { message?: string } | null) => { if (error) throw new Error(error.message || "No se pudo completar la operación."); };

export const surveysApi = {
  getOperatorPending: async (): Promise<{ attentionId: string; racCode: string; status: "PENDING_DECISION" | "SENT" } | null> => {
    const { data, error } = await supabase.rpc("get_current_operator_survey"); fail(error);
    return unwrap<{ attentionId: string; racCode: string; status: "PENDING_DECISION" | "SENT" }>(data);
  },
  getStatus: async (attentionId: string) => {
    const { data, error } = await supabase.rpc("get_attention_survey_status", { p_attention_id: attentionId }); fail(error);
    return data as "PENDING_DECISION" | "SENT" | "COMPLETED" | "SKIPPED" | "CANCELLED" | null;
  },
  send: async (attentionId: string) => {
    const { error } = await supabase.rpc("send_attention_survey", { p_attention_id: attentionId }); fail(error);
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
};
