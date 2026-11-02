import { describe, expect, it } from "vitest";

import { SharedWork } from "./shared.js";

describe("SharedWork", () => {
  it("coalesces the same query while it is in flight", async () => {
    const work = new SharedWork(2);
    let calls = 0;
    const run = () =>
      work.run("same", 60_000, async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return "answer";
      });

    const [first, second] = await Promise.all([run(), run()]);
    expect([first, second]).toEqual(["answer", "answer"]);
    expect(calls).toBe(1);
  });

  it("keeps the cache until its time is up", async () => {
    const work = new SharedWork(1);
    let calls = 0;
    const run = () =>
      work.run("fresh", 1, async () => {
        calls += 1;
        return calls;
      });

    expect(await run()).toBe(1);
    expect(await run()).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await run()).toBe(2);
  });

  it("does not run more calls at once than its limit", async () => {
    const work = new SharedWork(1);
    let active = 0;
    let peak = 0;
    const task = (id: number) =>
      work.run(`task-${id}`, 60_000, async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return id;
      });

    const results = await Promise.all([task(1), task(2), task(3)]);
    expect(results).toEqual([1, 2, 3]);
    expect(peak).toBe(1);
  });
});
