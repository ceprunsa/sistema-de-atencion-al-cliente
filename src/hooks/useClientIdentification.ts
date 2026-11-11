import { useMutation } from "@tanstack/react-query";
import { clientIdentificationApi } from "../api/clientIdentification";

export const useClientIdentification = () => {
  const dniMutation = useMutation({
    mutationFn: clientIdentificationApi.findByDni,
  });
  const emailMutation = useMutation({
    mutationFn: clientIdentificationApi.findByEmail,
  });

  return {
    findClient: dniMutation.mutateAsync,
    isSearchingClient: dniMutation.isPending,
    findClientsByEmail: emailMutation.mutateAsync,
    isSearchingClientsByEmail: emailMutation.isPending,
  };
};
