import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { attentionsApi } from "../api/attentions";
import { referralsApi } from "../api/referrals";
import type { PaginationState } from "../types";

export const useAttentions = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearchValue] = useState("");
  const [surveyStatus, setSurveyStatusValue] = useState("");
  const [referralStatus, setReferralStatusValue] = useState("");
  const [areaId, setAreaIdValue] = useState("");

  const query = useQuery({
    queryKey: ["attentions", "list", page, limit, search, surveyStatus, referralStatus, areaId],
    queryFn: () => attentionsApi.list(page, limit, search, surveyStatus, referralStatus, areaId),
    placeholderData: keepPreviousData,
  });

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
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    setPage,
    setLimit: (nextLimit: number) => {
      setLimit(nextLimit);
      setPage(1);
    },
    setSearch: (value: string) => {
      setSearchValue(value);
      setPage(1);
    },
    setSurveyStatus: (value: string) => { setSurveyStatusValue(value); setPage(1); },
    setReferralStatus: (value: string) => { setReferralStatusValue(value); setPage(1); },
    setAreaId: (value: string) => { setAreaIdValue(value); setPage(1); },
  };
};

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

  return {
    updateAttention: updateMutation.mutateAsync,
    disableAttention: disableMutation.mutateAsync,
    concludeReferral: concludeMutation.mutateAsync,
    disableReferral: disableReferralMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    isDisabling: disableMutation.isPending,
    isConcluding: concludeMutation.isPending,
    isDisablingReferral: disableReferralMutation.isPending,
  };
};
