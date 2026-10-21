const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

/** One Transjakarta BRT route relation, fetched with its way geometry. */
const query = `[out:json][timeout:180];
relation["type"="route"]["route"="bus"]["network"="Transjakarta"]["ref"="1"](-6.3,106.7,-6.1,107.05);
out geom;`;

async function fetchElements() {
  for (const endpoint of ENDPOINTS) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "daily-route/0.1 (transit data pipeline)",
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(200_000),
        });
        if (!response.ok) {
          await new Promise((r) => setTimeout(r, 4000 * attempt));
          continue;
        }
        return (await response.json()).elements ?? [];
      } catch {
        await new Promise((r) => setTimeout(r, 4000 * attempt));
      }
    }
  }
  return [];
}

const elements = await fetchElements();
console.log("relations:", elements.length);

for (const relation of elements) {
  const members = relation.members ?? [];
  const ways = members.filter((m) => m.type === "way");
  const stops = members.filter((m) => m.role === "stop");
  const points = ways.reduce((sum, way) => sum + (way.geometry ?? []).length, 0);
  console.log(
    `  ${relation.id} ${relation.tags?.name} — ${ways.length} ways, ${points} points, ${stops.length} stops`,
  );
  const first = ways[0];
  console.log("    first way geometry sample:", JSON.stringify((first?.geometry ?? []).slice(0, 3)));
  console.log("    way roles:", [...new Set(members.map((m) => `${m.type}:${m.role}`))].join(", "));
  console.log("    member keys:", Object.keys(first ?? {}).join(", "));
}
