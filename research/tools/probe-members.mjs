const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

async function fetchElements(query) {
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
          signal: AbortSignal.timeout(280_000),
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

const bus = await fetchElements(
  `[out:json][timeout:280];relation(2548961);out body;`,
);
console.log("BUS relation:", JSON.stringify(bus[0], null, 2).slice(0, 2500));

const mrt = await fetchElements(
  `[out:json][timeout:280];relation["type"="route"]["route"="subway"]["network"="MRT Jakarta"](-6.42,106.6,-5.95,107.25);out body;`,
);
console.log("MRT relations:", mrt.length);
console.log(JSON.stringify(mrt[0], null, 2).slice(0, 3000));

const lrt = await fetchElements(
  `[out:json][timeout:280];relation["type"="route"]["route"="light_rail"](-6.42,106.6,-5.95,107.25);out body;`,
);
console.log("LRT relations:", lrt.length);
for (const relation of lrt) {
  console.log(
    relation.id,
    JSON.stringify(relation.tags ?? {}).slice(0, 400),
    "members:",
    (relation.members ?? []).length,
  );
}
