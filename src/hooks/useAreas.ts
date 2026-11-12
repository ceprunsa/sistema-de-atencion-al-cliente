import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { areasApi, type AreaInput } from "../api/areas";

const AREAS_QUERY_KEY = ["areas"] as const;

export const useAreas = () => {
  const queryClient = useQueryClient();

  const areasQuery = useQuery({
    queryKey: AREAS_QUERY_KEY,
    queryFn: areasApi.list,
  });
  const closureAreaQuery = useQuery({
    queryKey: ["complaints", "closure-area"],
    queryFn: areasApi.getComplaintClosureArea,
  });

  const createMutation = useMutation({
    mutationFn: (values: AreaInput) => areasApi.create(values),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: AREAS_QUERY_KEY }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: AreaInput }) =>
      areasApi.update(id, values),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: AREAS_QUERY_KEY }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => areasApi.remove(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: AREAS_QUERY_KEY }),
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      areasApi.setStatus(id, isActive),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AREAS_QUERY_KEY });
      await queryClient.invalidateQueries({
        queryKey: ["complaints", "new", "catalogs"],
      });
    },
  });
  const closureAreaMutation = useMutation({
    mutationFn: areasApi.setComplaintClosureArea,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["complaints", "closure-area"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["complaints", "new", "catalogs"],
      });
    },
  });

  return {
    areas: areasQuery.data || [],
    isLoading: areasQuery.isLoading,
    isError: areasQuery.isError,
    error: areasQuery.error,
    closureAreaId: closureAreaQuery.data || null,
    isLoadingClosureArea: closureAreaQuery.isLoading,
    createArea: createMutation.mutateAsync,
    updateArea: updateMutation.mutateAsync,
    deleteArea: deleteMutation.mutateAsync,
    setAreaStatus: statusMutation.mutateAsync,
    setComplaintClosureArea: closureAreaMutation.mutateAsync,
    isSaving: createMutation.isPending || updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isChangingStatus: statusMutation.isPending,
    isSavingClosureArea: closureAreaMutation.isPending,
  };
};
