import { supabase } from "../supabase/config";
import type { PaginatedResponse, ReferralInboxItem } from "../types";

export const referralsApi = {
  listPending: async (page: number, limit: number, search: string, areaId?: string | null): Promise<PaginatedResponse<ReferralInboxItem>> => {
    const { data, error } = await supabase.rpc("list_referral_inbox", {
      p_page: page, p_limit: limit, p_search: search.trim(), p_area_id: areaId || null,
    });
    if (error) throw new Error(error.message);
    const rows = data || [];
    const total = Number(rows[0]?.total_count || 0);
    return {
      data: rows.map((row) => ({ id: row.id, attentionId: row.attention_id, racCode: row.rac_code,
        clientDni: row.client_dni, clientName: row.client_name, destinationAreaId: row.destination_area_id,
        destinationAreaName: row.destination_area_name, referredByName: row.referred_by_name, referredAt: row.referred_at })),
      total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },
  disable: async (id: string, reason: string) => {
    const { error } = await supabase.rpc("disable_attention_referral", { p_referral_id: id, p_reason: reason.trim() });
    if (error) throw new Error(error.message);
  },
};
