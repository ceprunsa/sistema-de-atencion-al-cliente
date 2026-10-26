import { useQuery } from "@tanstack/react-query";
import { dashboardApi, type DashboardFilters } from "../api/dashboard";

export const useDashboardStatistics = (filters: DashboardFilters) => useQuery({
  queryKey: ["dashboard", "statistics", filters.dateFrom, filters.dateTo, filters.admissionProcessId],
  queryFn: () => dashboardApi.getStatistics(filters),
  staleTime: 60_000,
});
