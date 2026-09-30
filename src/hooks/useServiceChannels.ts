import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  serviceChannelsApi,
  type ServiceChannelInput,
} from "../api/serviceChannels";

const SERVICE_CHANNELS_QUERY_KEY = ["service-channels"] as const;

export const useServiceChannels = () => {
  const queryClient = useQueryClient();

  const channelsQuery = useQuery({
    queryKey: SERVICE_CHANNELS_QUERY_KEY,
    queryFn: serviceChannelsApi.list,
  });

  const createMutation = useMutation({
    mutationFn: (values: ServiceChannelInput) =>
      serviceChannelsApi.create(values),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: SERVICE_CHANNELS_QUERY_KEY }),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: ServiceChannelInput;
    }) => serviceChannelsApi.update(id, values),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: SERVICE_CHANNELS_QUERY_KEY }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      serviceChannelsApi.setStatus(id, isActive),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: SERVICE_CHANNELS_QUERY_KEY }),
  });

  return {
    channels: channelsQuery.data || [],
    isLoading: channelsQuery.isLoading,
    isError: channelsQuery.isError,
    error: channelsQuery.error,
    createChannel: createMutation.mutateAsync,
    updateChannel: updateMutation.mutateAsync,
    setChannelStatus: statusMutation.mutateAsync,
    isSaving: createMutation.isPending || updateMutation.isPending,
    isChangingStatus: statusMutation.isPending,
  };
};
