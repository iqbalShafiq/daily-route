import { createTool } from "@anvia/core/tool";
import { listRecentObservations, listRiderPlaces } from "@daily-route/db";
import { habitsFrom } from "@daily-route/transit";
import { z } from "zod";

import type { TransitAgentContext } from "./context.js";
import { riderStore } from "./rider-context.js";

/**
 * The rider's own memory, as tools.
 *
 * Both tools are read-only and answer only for the rider in `riderStore`.
 * They deliberately return names and labels, never a station id: the model
 * must take a name back through `resolve_place` or `plan_journey`, where the
 * graph decides which stop it is.
 */

const emptyInput = z.object({});

export type MyPlacesOutput =
  | { signedIn: false }
  | {
      signedIn: true;
      places: {
        label: string;
        name: string;
        kind: "station" | "place";
        /** The street address, when the rider marked a current location. */
        address: string | null;
      }[];
    };

export type MyHabitsOutput =
  | { signedIn: false }
  | {
      signedIn: true;
      habits: {
        originName: string;
        destinationName: string;
        originLabel: string | null;
        destinationLabel: string | null;
        lineCodes: string[];
        weekday: number;
        minuteOfDay: number;
        time: string;
        count: number;
        /** The observation count, said plainly, without promising a vehicle. */
        basedOn: string;
      }[];
    };

export function createRiderTools(context: TransitAgentContext) {
  const places = createTool({
    name: "list_my_places",
    description:
      "Read the places the signed-in rider named, such as Home or Office. Call it " +
      "when the rider uses a saved label before asking them to repeat the stop. It " +
      "returns the label, the place name and the address the rider saved; pass that " +
      "name to resolve_place or plan_journey. It returns signedIn: false when nobody " +
      "is signed in.",
    inputSchema: emptyInput,
    execute: async (): Promise<MyPlacesOutput> => {
      const userId = riderStore.getStore()?.userId ?? "";
      if (userId.length === 0) return { signedIn: false };

      const saved = await listRiderPlaces(context.db, userId);
      return {
        signedIn: true,
        places: saved.map((place) => ({
          label: place.label,
          name: place.place.name,
          kind: place.place.kind,
          address: place.place.address,
        })),
      };
    },
  });

  const habits = createTool({
    name: "list_my_habits",
    description:
      "Read the journeys the signed-in rider plans often, derived from the last " +
      "four weeks. Call it for 'my usual journey', 'home', 'office' or a saved " +
      "label. It returns names, labels, a weekday and a time; it is not a live " +
      "departure and does not promise that a line is running.",
    inputSchema: emptyInput,
    execute: async (): Promise<MyHabitsOutput> => {
      const userId = riderStore.getStore()?.userId ?? "";
      if (userId.length === 0) return { signedIn: false };

      const now = new Date();
      const since = new Date(now.getTime() - 28 * 24 * 60 * 60_000);
      const observations = await listRecentObservations(context.db, userId, since);
      const usual = habitsFrom(observations, now);
      return {
        signedIn: true,
        habits: usual.map((habit) => ({
          originName: habit.originName,
          destinationName: habit.destinationName,
          originLabel: habit.originLabel,
          destinationLabel: habit.destinationLabel,
          lineCodes: habit.lineCodes,
          weekday: habit.weekday,
          minuteOfDay: habit.minuteOfDay,
          time: clockLabel(habit.minuteOfDay),
          count: habit.count,
          basedOn: `Based on ${habit.count} planned journeys. Not a live departure.`,
        })),
      };
    },
  });

  return [places, habits];
}

/** A minute of day as a 24-hour clock label, for the model's answer. */
function clockLabel(minuteOfDay: number): string {
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
