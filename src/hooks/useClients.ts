import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { clientsApi } from "../api/clients";
import type { PaginationState } from "../types";
import type { ClientInput } from "../types";

export const useClients = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimitValue] = useState(10);
  const [search, setSearchValue] = useState("");

  const query = useQuery({
    queryKey: ["clients", "list", page, limit, search],
    queryFn: () => clientsApi.list(page, limit, search),
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
    clients: query.data?.data || [],
    pagination,
    search,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    setPage,
    setLimit: (nextLimit: number) => {
      setLimitValue(nextLimit);
      setPage(1);
    },
    setSearch: (value: string) => {
      setSearchValue(value.trim());
      setPage(1);
    },
  };
};

export const useClient = (id?: string) =>
  useQuery({
    queryKey: ["clients", "detail", id],
    queryFn: () => clientsApi.getById(id || ""),
    enabled: !!id,
  });

export const useClientActions = () => {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["clients"] });
  const createMutation = useMutation({
    mutationFn: clientsApi.create,
    onSuccess: refresh,
  });
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      values,
      confirmDniChange,
    }: {
      id: string;
      values: ClientInput;
      confirmDniChange: boolean;
    }) => clientsApi.update(id, values, confirmDniChange),
    onSuccess: refresh,
  });

  return {
    createClient: createMutation.mutateAsync,
    updateClient: updateMutation.mutateAsync,
    isSaving: createMutation.isPending || updateMutation.isPending,
  };
};

export const useClientAttentions = (clientId?: string) => {
  const [page, setPage] = useState(1);
  const [limit, setLimitValue] = useState(10);
  const query = useQuery({
    queryKey: ["clients", "attentions", clientId, page, limit],
    queryFn: () => clientsApi.listAttentions(clientId || "", page, limit),
    enabled: !!clientId,
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
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    setPage,
    setLimit: (nextLimit: number) => {
      setLimitValue(nextLimit);
      setPage(1);
    },
  };
};
