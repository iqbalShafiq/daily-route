const ENDPOINT = "https://overpass-api.de/api/interpreter";

async function run(label, query) {
  const started = Date.now();
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "daily-route/0.1 (transit data research)",
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(280_000),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.log(label, "BAD RESPONSE", response.status, text.slice(0, 400));
    return null;
  }
  const elements = json.elements ?? [];
  console.log(`--- ${label}: ${elements.length} elements (${Date.now() - started}ms)`);
  const tags = elements.map((element) => element.tags ?? {}).filter((tag) => Object.keys(tag).length > 0);
  const networks = new Map();
  const refs = new Set();
  for (const tag of tags) {
    const key = `${tag.network ?? "?"} | ${tag.route ?? "?"} | ${tag.operator ?? "?"}`;
    networks.set(key, (networks.get(key) ?? 0) + 1);
    if (tag.ref) refs.add(tag.ref);
  }
  console.log("network/route/operator:", [...networks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15));
  console.log("sample refs:", [...refs].slice(0, 40));
  console.log("sample element:", JSON.stringify(elements[0], null, 2).slice(0, 900));
  return elements;
}

await run(
  "bus route relations",
  `[out:json][timeout:280];
relation["type"="route"]["route"="bus"](-6.4,106.5,-6.0,107.2);
out tags;`,
);

await run(
  "train/metro route relations",
  `[out:json][timeout:280];
(
  relation["type"="route"]["route"="train"](-6.4,106.5,-6.0,107.2);
  relation["type"="route"]["route"="subway"](-6.4,106.5,-6.0,107.2);
  relation["type"="route"]["route"="light_rail"](-6.4,106.5,-6.0,107.2);
);
out tags;`,
);

await run(
  "bus stops (operators)",
  `[out:json][timeout:280];
node["highway"="bus_stop"](-6.4,106.5,-6.0,107.2);
out tags;`,
);
