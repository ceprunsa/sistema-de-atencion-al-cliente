import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { attentionsApi } from "../api/attentions";
import { referralsApi } from "../api/referrals";
import type { PaginationState } from "../types";

export const useAttentions = () => {
  const [params, setParams] = useSearchParams();
  const parsedPage = Number(params.get("page"));
  const parsedLimit = Number(params.get("limit"));
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit = [2, 5, 10, 15, 20].includes(parsedLimit) ? parsedLimit : 10;
  const search = params.get("q") || "";
  const surveyStatus = params.get("survey") || "";
  const referralStatus = params.get("referral") || "";
  const areaId = params.get("area") || "";
  const admissionProcessId = params.get("process") || "";
  const serviceChannelId = params.get("channel") || "";
  const workstationId = params.get("workstation") || "";

  const updateParam = useCallback((key: string, value: string, resetPage = true) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      if (resetPage) next.delete("page");
      return next;
    });
  }, [setParams]);

  const query = useQuery({
    queryKey: ["attentions", "list", page, limit, search, surveyStatus, referralStatus, areaId, admissionProcessId, serviceChannelId, workstationId],
    queryFn: () => attentionsApi.list(page, limit, search, surveyStatus, referralStatus, areaId, admissionProcessId, serviceChannelId, workstationId),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (query.data && page > query.data.totalPages) {
      updateParam("page", String(query.data.totalPages), false);
    }
  }, [page, query.data, updateParam]);

  const pagination: PaginationState = query.data
    ? {
        page: query.data.page,
        limit: query.data.limit,
        total: query.data.total,
        totalPages: query.data.totalPages,
      }
    : { page, limit, total: 0, totalPages: 1 };

  return {
    attentions: query.data?.data || [],
    pagination,
    search,
    surveyStatus,
    referralStatus,
    areaId,
    admissionProcessId,
    serviceChannelId,
    workstationId,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    setPage: (nextPage: number) => updateParam("page", nextPage > 1 ? String(nextPage) : "", false),
    setLimit: (nextLimit: number) => {
      updateParam("limit", nextLimit === 10 ? "" : String(nextLimit));
    },
    setSearch: (value: string) => updateParam("q", value.trim()),
    setSurveyStatus: (value: string) => updateParam("survey", value),
    setReferralStatus: (value: string) => updateParam("referral", value),
    setAreaId: (value: string) => updateParam("area", value),
    setAdmissionProcessId: (value: string) => updateParam("process", value),
    setServiceChannelId: (value: string) => updateParam("channel", value),
    setWorkstationId: (value: string) => updateParam("workstation", value),
  };
};

export const useAttentionFilterOptions = () =>
  useQuery({
    queryKey: ["attentions", "filter-options"],
    queryFn: attentionsApi.listFilterOptions,
    staleTime: 5 * 60 * 1000,
  });

export const useAttention = (id?: string) =>
  useQuery({
    queryKey: ["attentions", "detail", id],
    queryFn: () => attentionsApi.getById(id || ""),
    enabled: !!id,
  });

export const useAttentionActions = () => {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["attentions"] });
  const updateMutation = useMutation({ mutationFn: attentionsApi.update, onSuccess: refresh });
  const disableMutation = useMutation({ mutationFn: attentionsApi.disable, onSuccess: refresh });
  const concludeMutation = useMutation({ mutationFn: attentionsApi.concludeReferral, onSuccess: refresh });
  const disableReferralMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => referralsApi.disable(id, reason),
    onSuccess: refresh,
  });
  const setEmailResponseMutation = useMutation({
    mutationFn: attentionsApi.setEmailResponseAt,
    onSuccess: refresh,
  });

  return {
    updateAttention: updateMutation.mutateAsync,
    disableAttention: disableMutation.mutateAsync,
    concludeReferral: concludeMutation.mutateAsync,
    disableReferral: disableReferralMutation.mutateAsync,
    setEmailResponseAt: setEmailResponseMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    isDisabling: disableMutation.isPending,
    isConcluding: concludeMutation.isPending,
    isDisablingReferral: disableReferralMutation.isPending,
    isSettingEmailResponse: setEmailResponseMutation.isPending,
  };
};
