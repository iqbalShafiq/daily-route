import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { api, type PlanResult } from "../../lib/api.js";

/**
 * The route plan.
 *
 * The query is disabled until both places are filled in, so typing never
 * fires a request. The server does the resolution, the planning and the
 * disruption check in one round trip.
 */
export function usePlan(
  origin: string,
  destination: string,
  enabled: boolean,
): UseQueryResult<PlanResult, Error> {
  return useQuery({
    queryKey: ["plan", origin.trim(), destination.trim()],
    queryFn: () => api.plan(origin, destination),
    enabled:
      enabled &&
      origin.trim().length > 1 &&
      destination.trim().length > 1 &&
      origin.trim() !== destination.trim(),
    retry: false,
    staleTime: 30_000,
  });
}

export type UsePlanResult = UseQueryResult<PlanResult, Error>;
