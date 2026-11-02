import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { api, type PlanResult } from "../../lib/api.js";

/**
 * One request for a journey.
 *
 * Coordinates are set only when the reader picked a place that is not a
 * halte or a stasiun. A named stop is resolved by the server from the text.
 */
export type PlanRequest = {
  origin: string;
  destination: string;
  originLatitude?: number;
  originLongitude?: number;
  destinationLatitude?: number;
  destinationLongitude?: number;
  /** ISO departure instant; absent means now. */
  at?: string;
  /** Prefer fewer night walks and service that runs at this hour. */
  nightSafe?: boolean;
};

/**
 * The route plan.
 *
 * The query is disabled until both places are filled in, so typing never
 * fires a request. The server does the resolution, the planning and the
 * disruption check in one round trip.
 */
export function usePlan(request: PlanRequest | null): UseQueryResult<PlanResult, Error> {
  return useQuery({
    queryKey: ["plan", request],
    queryFn: () => {
      if (!request) throw new Error("No journey was requested");
      return api.plan(request);
    },
    enabled:
      request !== null &&
      request.origin.trim().length > 1 &&
      request.destination.trim().length > 1 &&
      request.origin.trim() !== request.destination.trim(),
    retry: false,
    staleTime: 30_000,
  });
}

export type UsePlanResult = UseQueryResult<PlanResult, Error>;
