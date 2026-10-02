import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { workstationsApi } from "../api/workstations";

export const useWorkstations = () => {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["workstations"] });
  const stations = useQuery({ queryKey: ["workstations"], queryFn: workstationsApi.list });
  const users = useQuery({ queryKey: ["workstations", "users"], queryFn: workstationsApi.listAssignableUsers });
  const create = useMutation({ mutationFn: workstationsApi.create, onSuccess: refresh });
  const update = useMutation({ mutationFn: ({ id, values }: { id: string; values: { name?: string; isActive?: boolean } }) => workstationsApi.update(id, values), onSuccess: refresh });
  const assign = useMutation({ mutationFn: ({ workstationId, userId }: { workstationId: string; userId: string }) => workstationsApi.assign(workstationId, userId), onSuccess: refresh });
  const unassign = useMutation({ mutationFn: ({ workstationId, reason }: { workstationId: string; reason: string }) => workstationsApi.unassign(workstationId, reason), onSuccess: refresh });
  const deactivateTablet = useMutation({ mutationFn: ({ workstationId, reason }: { workstationId: string; reason: string }) => workstationsApi.deactivateTablet(workstationId, reason), onSuccess: refresh });
  return { workstations: stations.data || [], users: users.data || [], isLoading: stations.isLoading || users.isLoading,
    error: stations.error || users.error, create: create.mutateAsync, update: update.mutateAsync,
    assign: assign.mutateAsync, unassign: unassign.mutateAsync, deactivateTablet: deactivateTablet.mutateAsync,
    isSaving: create.isPending || update.isPending || assign.isPending || unassign.isPending || deactivateTablet.isPending };
};
