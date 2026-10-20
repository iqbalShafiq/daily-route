import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on("console", (message) => {
  console.log(`[console:${message.type()}]`, message.text().slice(0, 300));
});
page.on("pageerror", (error) => console.log("[pageerror]", String(error).slice(0, 400)));
page.on("requestfailed", (request) =>
  console.log("[requestfailed]", request.url().slice(0, 140), request.failure()?.errorText),
);

await page.goto("http://localhost:3010/", { waitUntil: "networkidle" });

const info = await page.evaluate(() => {
  const container = document.querySelector(".map-canvas");
  const chain = [];
  let node = container?.parentElement ?? null;
  while (node && chain.length < 6) {
    const style = getComputedStyle(node);
    chain.push({
      tag: node.tagName,
      cls: node.className?.toString().slice(0, 110),
      height: node.getBoundingClientRect().height,
      display: style.display,
      gridRows: style.gridTemplateRows,
      position: style.position,
    });
    node = node.parentElement;
  }
  console.log("CHAIN", JSON.stringify(chain, null, 2));
  const canvas = document.querySelector("canvas.maplibregl-canvas");
  return {
    containerExists: Boolean(container),
    containerBox: container?.getBoundingClientRect().toJSON(),
    canvasExists: Boolean(canvas),
    canvasBox: canvas?.getBoundingClientRect().toJSON(),
    canvasSize: canvas ? { w: canvas.width, h: canvas.height } : null,
  };
});
console.log("DOM:", JSON.stringify(info, null, 2));

await page.getByLabel("Dari").fill("Bundaran HI");
await page.getByLabel("Ke").fill("Kelapa Gading");
await page.getByRole("button", { name: "Tampilkan rute" }).click();
await page.waitForTimeout(6000);

const after = await page.evaluate(() => {
  const canvas = document.querySelector("canvas.maplibregl-canvas");
  const context = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
  return {
    canvasSize: canvas ? { w: canvas.width, h: canvas.height } : null,
    hasContext: Boolean(context),
  };
});
console.log("after route:", JSON.stringify(after));

await page.screenshot({ path: "/tmp/map-debug.png" });
await browser.close();
