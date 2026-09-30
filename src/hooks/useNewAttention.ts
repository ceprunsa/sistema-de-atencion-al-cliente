import { useMutation, useQuery } from "@tanstack/react-query";
import { attentionsApi } from "../api/attentions";

export const useNewAttention = () => {
  const catalogsQuery = useQuery({
    queryKey: ["attentions", "new", "catalogs"],
    queryFn: attentionsApi.getNewAttentionCatalogs,
  });

  const clientMutation = useMutation({
    mutationFn: attentionsApi.findClientByDni,
  });

  const createMutation = useMutation({
    mutationFn: attentionsApi.create,
  });

  return {
    catalogs: catalogsQuery.data,
    isLoadingCatalogs: catalogsQuery.isLoading,
    isErrorCatalogs: catalogsQuery.isError,
    findClient: clientMutation.mutateAsync,
    isSearchingClient: clientMutation.isPending,
    createAttention: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
};
