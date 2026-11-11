import { useMutation, useQuery } from "@tanstack/react-query";
import { attentionsApi } from "../api/attentions";
import { useClientIdentification } from "./useClientIdentification";

export const useNewAttention = () => {
  const clientIdentification = useClientIdentification();
  const catalogsQuery = useQuery({
    queryKey: ["attentions", "new", "catalogs"],
    queryFn: attentionsApi.getNewAttentionCatalogs,
  });

  const createMutation = useMutation({
    mutationFn: attentionsApi.create,
  });

  const duplicateMutation = useMutation({
    mutationFn: attentionsApi.findEmailDuplicates,
  });

  const exchangeDuplicateMutation = useMutation({
    mutationFn: attentionsApi.findEmailExchangeDuplicates,
  });

  return {
    catalogs: catalogsQuery.data,
    isLoadingCatalogs: catalogsQuery.isLoading,
    isErrorCatalogs: catalogsQuery.isError,
    findClient: clientIdentification.findClient,
    isSearchingClient: clientIdentification.isSearchingClient,
    findClientsByEmail: clientIdentification.findClientsByEmail,
    isSearchingClientsByEmail:
      clientIdentification.isSearchingClientsByEmail,
    createAttention: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    findEmailDuplicates: duplicateMutation.mutateAsync,
    findEmailExchangeDuplicates: exchangeDuplicateMutation.mutateAsync,
    isCheckingEmailDuplicates: duplicateMutation.isPending || exchangeDuplicateMutation.isPending,
  };
};
