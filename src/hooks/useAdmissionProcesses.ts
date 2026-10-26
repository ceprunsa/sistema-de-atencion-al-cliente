import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { admissionProcessesApi, type AdmissionProcessInput } from "../api/admissionProcesses";

const KEY = ["admission-processes"] as const;

export const useAdmissionProcesses = () => {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: admissionProcessesApi.list });
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });
  const create = useMutation({ mutationFn: admissionProcessesApi.create, onSuccess: refresh });
  const update = useMutation({ mutationFn: ({ id, values }: { id: string; values: AdmissionProcessInput }) => admissionProcessesApi.update(id, values), onSuccess: refresh });
  const status = useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => admissionProcessesApi.setStatus(id, isActive), onSuccess: refresh });
  return {
    processes: query.data || [], isLoading: query.isLoading, isError: query.isError,
    createProcess: create.mutateAsync, updateProcess: update.mutateAsync, setProcessStatus: status.mutateAsync,
    isSaving: create.isPending || update.isPending || status.isPending,
  };
};
