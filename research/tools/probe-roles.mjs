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

// Relation 2548961 is the "Angkot 33" one; pick a real Transjakarta BRT relation instead.
const relations = await fetchElements(
  `[out:json][timeout:280];relation["type"="route"]["route"="bus"]["network"="Transjakarta"]["ref"="1"](-6.42,106.6,-5.95,107.25);out body;`,
);
console.log("BRT 1 relations:", relations.length);
for (const relation of relations) {
  const roles = new Map();
  for (const member of relation.members ?? []) {
    roles.set(`${member.type}:${member.role}`, (roles.get(`${member.type}:${member.role}`) ?? 0) + 1);
  }
  console.log(relation.id, JSON.stringify(relation.tags ?? {}).slice(0, 300));
  console.log("  members:", JSON.stringify([...roles.entries()]));
}

// Now fetch the stop members of one relation with their tags.
const target = relations[0];
if (target) {
  const stopIds = (target.members ?? [])
    .filter((member) => member.type === "node" && member.role !== "")
    .map((member) => member.ref);
  console.log("stop member ids:", stopIds.slice(0, 10), "count", stopIds.length);
  if (stopIds.length > 0) {
    const nodes = await fetchElements(
      `[out:json][timeout:280];node(id:${stopIds.slice(0, 5).join(",")});out body;`,
    );
    for (const node of nodes) console.log("NODE", node.id, JSON.stringify(node.tags ?? {}).slice(0, 300), node.lat, node.lon);
  }
}
