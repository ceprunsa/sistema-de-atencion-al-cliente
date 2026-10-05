import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { areasApi } from "../api/areas";

const AREAS_QUERY_KEY = ["areas"] as const;

export const useAreas = () => {
  const queryClient = useQueryClient();

  const areasQuery = useQuery({
    queryKey: AREAS_QUERY_KEY,
    queryFn: areasApi.list,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => areasApi.create(name),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: AREAS_QUERY_KEY }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      areasApi.update(id, name),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: AREAS_QUERY_KEY }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => areasApi.remove(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: AREAS_QUERY_KEY }),
  });

  return {
    areas: areasQuery.data || [],
    isLoading: areasQuery.isLoading,
    isError: areasQuery.isError,
    error: areasQuery.error,
    createArea: createMutation.mutateAsync,
    updateArea: updateMutation.mutateAsync,
    deleteArea: deleteMutation.mutateAsync,
    isSaving: createMutation.isPending || updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
};
