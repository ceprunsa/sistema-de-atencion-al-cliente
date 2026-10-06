import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { referralsApi } from "../api/referrals";
import { supabase } from "../supabase/config";
import type { PaginationState } from "../types";
import { useAuth } from "./useAuth";

export const usePendingReferralCount = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["referrals", "pending-count", user?.areaId],
    queryFn: referralsApi.getPendingCount,
    enabled: !!user,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!user?.areaId) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["referrals", "pending-count"] });
      void queryClient.invalidateQueries({ queryKey: ["referrals", "inbox"] });
    };

    void supabase.realtime.setAuth().then(() => {
      if (cancelled) return;
      channel = supabase
        .channel(`referrals:area:${user.areaId}`, { config: { private: true } })
        .on("broadcast", { event: "referral_changed" }, refresh)
        .subscribe((status) => {
          if (status === "SUBSCRIBED") refresh();
        });
    });
    window.addEventListener("online", refresh);

    return () => {
      cancelled = true;
      window.removeEventListener("online", refresh);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [queryClient, user?.areaId]);

  return {
    pendingCount: query.data || 0,
    isLoadingPendingCount: query.isLoading,
  };
};

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
