const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const query = `[out:json][timeout:180];
(
  node["railway"="station"](-6.35,106.75,-6.10,107.05);
  node["railway"="halt"](-6.35,106.75,-6.10,107.05);
  node["public_transport"="station"](-6.35,106.75,-6.10,107.05);
);
out tags;`;

async function tryEndpoint(endpoint) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "daily-route/0.1 (transit data research)",
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(200_000),
  });
  if (!response.ok) return { endpoint, ok: false, status: response.status, body: (await response.text()).slice(0, 200) };
  const text = await response.text();
  try {
    const json = JSON.parse(text);
    return { endpoint, ok: true, count: json.elements?.length ?? 0, sample: json.elements?.slice(0, 5) };
  } catch {
    return { endpoint, ok: false, status: 200, body: text.slice(0, 200) };
  }
}

for (const endpoint of ENDPOINTS) {
  const started = Date.now();
  try {
    const result = await tryEndpoint(endpoint);
    console.log(endpoint, JSON.stringify(result, null, 2).slice(0, 2000), `${Date.now() - started}ms`);
    if (result.ok) break;
  } catch (error) {
    console.log(endpoint, "FAILED", String(error).slice(0, 200));
  }
}
