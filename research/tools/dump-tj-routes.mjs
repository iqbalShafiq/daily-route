const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

const query = `[out:json][timeout:280];
relation["type"="route"]["route"="bus"]["network"~"Transjakarta|Trans Jakarta|Jakarta"](-6.42,106.6,-5.95,107.25);
out tags;`;

async function fetchAll() {
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
          console.error(endpoint, response.status);
          await new Promise((r) => setTimeout(r, 4000 * attempt));
          continue;
        }
        const json = await response.json();
        return json.elements ?? [];
      } catch (error) {
        console.error(endpoint, String(error).slice(0, 100));
        await new Promise((r) => setTimeout(r, 4000 * attempt));
      }
    }
  }
  return [];
}

const elements = await fetchAll();
console.log("relations:", elements.length);

const rows = elements.map((element) => {
  const tags = element.tags ?? {};
  return {
    id: element.id,
    ref: tags.ref ?? "",
    name: tags.name ?? "",
    designation: tags.designation ?? "",
    operator: tags.operator ?? "",
    network: tags.network ?? "",
    from: tags.from ?? "",
    to: tags.to ?? "",
    route: tags.route ?? "",
    mode: tags.bus ?? tags.psv ?? "",
    wiki: tags.wikipedia ?? "",
  };
});

rows.sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }));
for (const row of rows) {
  console.log(
    [row.ref, row.name, row.designation, row.operator, row.from, row.to, row.route, row.mode].join(" | "),
  );
}
