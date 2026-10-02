import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { referralsApi } from "../api/referrals";
import type { PaginationState } from "../types";

export const useReferralInbox = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimitState] = useState(10);
  const [search, setSearchState] = useState("");
  const [areaId, setAreaIdState] = useState("");
  const query = useQuery({
    queryKey: ["referrals", "inbox", page, limit, search, areaId],
    queryFn: () => referralsApi.listPending(page, limit, search, areaId),
    placeholderData: keepPreviousData,
  });
  const pagination: PaginationState = query.data
    ? { page: query.data.page, limit: query.data.limit, total: query.data.total, totalPages: query.data.totalPages }
    : { page, limit, total: 0, totalPages: 1 };
  return {
    referrals: query.data?.data || [], pagination, isLoading: query.isLoading,
    isFetching: query.isFetching, isError: query.isError, error: query.error,
    search, areaId, setPage,
    setLimit: (value: number) => { setLimitState(value); setPage(1); },
    setSearch: (value: string) => { setSearchState(value); setPage(1); },
    setAreaId: (value: string) => { setAreaIdState(value); setPage(1); },
  };
};
