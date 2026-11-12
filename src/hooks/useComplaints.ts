import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { complaintsApi } from "../api/complaints";
import type {
  ComplaintClosureReviewInput,
  ComplaintListScope,
  ComplaintManagementInput,
  ComplaintSacDecisionInput,
  ComplaintStatus,
  PaginationState,
} from "../types";
import { useAuth } from "./useAuth";

export const useComplaintList = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimitState] = useState(10);
  const [search, setSearchState] = useState("");
  const [status, setStatusState] = useState<ComplaintStatus | "">("");
  const [areaId, setAreaIdState] = useState("");
  const [scope, setScopeState] = useState<ComplaintListScope>("ALL");

  const query = useQuery({
    queryKey: [
      "complaints",
      "list",
      page,
      limit,
      search,
      status,
      areaId,
      scope,
    ],
    queryFn: () =>
      complaintsApi.list(page, limit, search, status, areaId, scope),
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
    complaints: query.data?.data || [],
    pagination,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    search,
    status,
    areaId,
    scope,
    setPage,
    setLimit: (value: number) => {
      setLimitState(value);
      setPage(1);
    },
    setSearch: (value: string) => {
      setSearchState(value);
      setPage(1);
    },
    setStatus: (value: ComplaintStatus | "") => {
      setStatusState(value);
      setPage(1);
    },
    setAreaId: (value: string) => {
      setAreaIdState(value);
      setPage(1);
    },
    setScope: (value: ComplaintListScope) => {
      setScopeState(value);
      setPage(1);
    },
  };
};

export const useComplaintDetail = (id?: string) =>
  useQuery({
    queryKey: ["complaints", "detail", id],
    queryFn: () => complaintsApi.getById(id!),
    enabled: Boolean(id),
  });

export const useComplaintManagement = (complaintId: string) => {
  const queryClient = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["complaints", "detail", complaintId],
      }),
      queryClient.invalidateQueries({ queryKey: ["complaints", "list"] }),
      queryClient.invalidateQueries({
        queryKey: ["complaints", "pending-count"],
      }),
    ]);
  };
  const start = useMutation({
    mutationFn: () => complaintsApi.startManagement(complaintId),
    onSuccess: refresh,
  });
  const submit = useMutation({
    mutationFn: (values: ComplaintManagementInput) =>
      complaintsApi.submitManagement(complaintId, values),
    onSuccess: refresh,
  });
  return { start, submit };
};

export const useComplaintClosureReview = (complaintId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ComplaintClosureReviewInput) =>
      complaintsApi.reviewClosure(complaintId, values),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["complaints", "detail", complaintId],
        }),
        queryClient.invalidateQueries({ queryKey: ["complaints", "list"] }),
        queryClient.invalidateQueries({
          queryKey: ["complaints", "pending-count"],
        }),
      ]);
    },
  });
};

export const useComplaintSacDecision = (complaintId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ComplaintSacDecisionInput) =>
      complaintsApi.decideSac(complaintId, values),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["complaints", "detail", complaintId],
        }),
        queryClient.invalidateQueries({ queryKey: ["complaints", "list"] }),
        queryClient.invalidateQueries({
          queryKey: ["complaints", "pending-count"],
        }),
      ]);
    },
  });
};

export const usePendingComplaintCount = () => {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["complaints", "pending-count", user?.areaId],
    queryFn: complaintsApi.getPendingCount,
    enabled: Boolean(user),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  return {
    pendingCount: query.data || 0,
    isLoadingPendingCount: query.isLoading,
  };
};
