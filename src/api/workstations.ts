import { supabase } from "../supabase/config";
import type { UserProfile, Workstation } from "../types";

const message = (error: { message?: string }) => error.message || "No se pudo completar la operación.";

export const workstationsApi = {
  list: async (): Promise<Workstation[]> => {
    const [{ data: stations, error: stationError }, { data: assignments, error: assignmentError }, { data: bindings, error: bindingError }] = await Promise.all([
      supabase.from("workstations").select("*").order("name"),
      supabase.from("workstation_assignments").select("workstation_id,user_id").is("ended_at", null),
      supabase.from("tablet_bindings").select("id,workstation_id,last_seen_at").is("deactivated_at", null),
    ]);
    if (stationError) throw new Error(message(stationError));
    if (assignmentError) throw new Error(message(assignmentError));
    if (bindingError) throw new Error(message(bindingError));

    const userIds = [...new Set((assignments || []).map((item) => item.user_id))];
    const { data: profiles, error: profileError } = userIds.length
      ? await supabase.from("profiles").select("id,first_name,middle_name,paternal_surname,maternal_surname").in("id", userIds)
      : { data: [], error: null };
    if (profileError) throw new Error(message(profileError));
    const names = new Map((profiles || []).map((profile) => [profile.id, [profile.first_name, profile.middle_name, profile.paternal_surname, profile.maternal_surname].filter(Boolean).join(" ")]));

    return (stations || []).map((station) => {
      const assignment = (assignments || []).find((item) => item.workstation_id === station.id);
      const binding = (bindings || []).find((item) => item.workstation_id === station.id);
      return {
        id: station.id,
        name: station.name,
        isActive: station.is_active,
        assignedUserId: assignment?.user_id || null,
        assignedUserName: assignment ? names.get(assignment.user_id) || "Usuario" : null,
        tabletBindingId: binding?.id || null,
        tabletLastSeenAt: binding?.last_seen_at || null,
      };
    });
  },

  listAssignableUsers: async (): Promise<Array<Pick<UserProfile, "id" | "firstName" | "middleName" | "paternalSurname" | "maternalSurname">>> => {
    const { data, error } = await supabase.from("profiles")
      .select("id,first_name,middle_name,paternal_surname,maternal_surname")
      .eq("status", "active").order("paternal_surname");
    if (error) throw new Error(message(error));
    return (data || []).map((row) => ({ id: row.id, firstName: row.first_name, middleName: row.middle_name,
      paternalSurname: row.paternal_surname, maternalSurname: row.maternal_surname }));
  },

  create: async (name: string) => {
    const { error } = await supabase.from("workstations").insert({ name: name.trim() });
    if (error) throw new Error(message(error));
  },
  update: async (id: string, values: { name?: string; isActive?: boolean }) => {
    const payload: { name?: string; is_active?: boolean } = {};
    if (values.name !== undefined) payload.name = values.name.trim();
    if (values.isActive !== undefined) payload.is_active = values.isActive;
    const { error } = await supabase.from("workstations").update(payload).eq("id", id);
    if (error) throw new Error(message(error));
  },
  assign: async (workstationId: string, userId: string) => {
    const { error } = await supabase.rpc("assign_workstation", { p_workstation_id: workstationId, p_user_id: userId });
    if (error) throw new Error(message(error));
  },
  unassign: async (workstationId: string, reason: string) => {
    const { error } = await supabase.rpc("unassign_workstation", { p_workstation_id: workstationId, p_reason: reason.trim() });
    if (error) throw new Error(message(error));
  },
  deactivateTablet: async (workstationId: string, reason: string) => {
    const { error } = await supabase.rpc("force_deactivate_tablet", { p_workstation_id: workstationId, p_reason: reason.trim() });
    if (error) throw new Error(message(error));
  },
};
