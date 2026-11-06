import { useCallback, useState } from "react";

import { ApiError, api } from "../../lib/api.js";

import type { ChosenPlace } from "./place-memory.js";

/**
 * The place the rider is standing on.
 *
 * The browser owns the position; the server owns the address. The hook
 * asks the browser once, sends the coordinate to the reverse lookup, and
 * keeps the answer for the rest of the visit. It does not persist the
 * position: a location is true for this moment, and a stored one would
 * quietly become yesterday's.
 */

export type CurrentPlaceState = {
  status: "idle" | "locating" | "ready" | "error";
  place: ChosenPlace | null;
  error: string | null;
};

export type LocateResult =
  | { ok: true; place: ChosenPlace }
  | { ok: false; error: string };

const UNSUPPORTED = "This browser does not share its location.";
const UNAVAILABLE =
  "Your location could not be read. Allow location access and try again.";

function readPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
      enableHighAccuracy: true,
      timeout: 15_000,
    });
  });
}

export function useCurrentPlace() {
  const [state, setState] = useState<CurrentPlaceState>({
    status: "idle",
    place: null,
    error: null,
  });

  const locate = useCallback(async (): Promise<LocateResult> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState((current) => ({ ...current, status: "error", error: UNSUPPORTED }));
      return { ok: false, error: UNSUPPORTED };
    }

    setState((current) => ({ ...current, status: "locating", error: null }));
    const position = await readPosition();
    if (!position) {
      setState((current) => ({ ...current, status: "error", error: UNAVAILABLE }));
      return { ok: false, error: UNAVAILABLE };
    }

    try {
      const result = await api.reversePlace(
        position.coords.latitude,
        position.coords.longitude,
      );
      const place: ChosenPlace = {
        kind: "place",
        id: result.place.id,
        name: result.place.name,
        address: result.place.address,
        latitude: result.place.latitude,
        longitude: result.place.longitude,
        systemId: null,
        systemName: null,
      };
      setState({ status: "ready", place, error: null });
      return { ok: true, place };
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "The address for your location could not be read. Try again.";
      setState((current) => ({ ...current, status: "error", error: message }));
      return { ok: false, error: message };
    }
  }, []);

  const clear = useCallback(() => {
    setState({ status: "idle", place: null, error: null });
  }, []);

  return {
    place: state.place,
    status: state.status,
    error: state.error,
    locating: state.status === "locating",
    locate,
    clear,
  };
}
