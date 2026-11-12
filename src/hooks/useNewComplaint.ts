import { useMutation, useQuery } from "@tanstack/react-query";
import { complaintsApi } from "../api/complaints";
import { useClientIdentification } from "./useClientIdentification";

export const useNewComplaint = () => {
  const clientIdentification = useClientIdentification();
  const catalogsQuery = useQuery({
    queryKey: ["complaints", "new", "catalogs"],
    queryFn: complaintsApi.getCreationCatalogs,
  });
  const attentionMutation = useMutation({
    mutationFn: complaintsApi.findAttention,
  });
  const createMutation = useMutation({
    mutationFn: complaintsApi.create,
  });

  return {
    catalogs: catalogsQuery.data,
    isLoadingCatalogs: catalogsQuery.isLoading,
    isErrorCatalogs: catalogsQuery.isError,
    catalogsError: catalogsQuery.error,
    refetchCatalogs: catalogsQuery.refetch,
    findClient: clientIdentification.findClient,
    isSearchingClient: clientIdentification.isSearchingClient,
    findAttention: attentionMutation.mutateAsync,
    isSearchingAttention: attentionMutation.isPending,
    createComplaint: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
};
