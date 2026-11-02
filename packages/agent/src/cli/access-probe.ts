import { createDb, loadNetwork } from "@daily-route/db";
import { bestAccess, planRoutes, stopsWithinWalk } from "@daily-route/transit";

const url = process.env["DATABASE_URL"];
if (!url) throw new Error("DATABASE_URL missing");
const db = createDb(url);
const network = await loadNetwork(db);
const origin = network.stations.find((station) => station.id === "transjakarta:grogol-reformasi");
const destination = network.stations.find((station) => station.id === "transjakarta:simpang-kuningan");
if (!origin || !destination) throw new Error("station missing");
const closed = new Set([destination.id]);
const accesses = stopsWithinWalk(
  network,
  { latitude: destination.latitude, longitude: destination.longitude },
  { maxKm: 1.2, limit: 10, exclude: closed },
);
for (const access of accesses) {
  const route = planRoutes(network, origin.id, access.station.id, { maxAlternatives: 1 })[0];
  console.log(
    [
      access.station.name.padEnd(30),
      `${access.distanceKm.toFixed(2)} km`,
      `${access.minutes} min walk`,
      route ? `${route.durationMinutes} min ride` : "no route",
      route ? `${route.transferCount} transfer` : "",
      route ? `${route.distanceKm.toFixed(2)} km` : "",
    ].join(" | "),
  );
}
const best = bestAccess(
  accesses,
  (station) => planRoutes(network, origin.id, station.id, { maxAlternatives: 1 })[0]?.cost ?? null,
);
console.log("best:", best?.access.station.name, best?.cost);
