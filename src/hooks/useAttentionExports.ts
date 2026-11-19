import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { attentionExportsApi } from "../api/attentionExports";

export const useAttentionExports = () => {
  const queryClient = useQueryClient();
  const jobs = useQuery({
    queryKey: ["attentions", "exports"],
    queryFn: attentionExportsApi.list,
    refetchInterval: (query) => query.state.data?.some((job) =>
      job.status === "QUEUED" || job.status === "PROCESSING") ? 3000 : false,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["attentions", "exports"] });
  const start = useMutation({ mutationFn: attentionExportsApi.start, onSuccess: refresh });
  const retry = useMutation({ mutationFn: attentionExportsApi.retry, onSuccess: refresh });
  const download = useMutation({ mutationFn: attentionExportsApi.download });

  return {
    jobs: jobs.data || [],
    isLoading: jobs.isLoading,
    isError: jobs.isError,
    error: jobs.error,
    refetch: jobs.refetch,
    start: start.mutateAsync,
    retry: retry.mutateAsync,
    download: download.mutateAsync,
    isStarting: start.isPending,
    retryingJobId: retry.isPending ? retry.variables : null,
    downloadingJobId: download.isPending ? download.variables : null,
  };
};
