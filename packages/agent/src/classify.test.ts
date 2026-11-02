import { describe, expect, it } from "vitest";

import { classificationPrompt, type ClassifyInput } from "./classify.js";

const input: ClassifyInput = {
  text: "",
  url: "https://x.com/mrtjakarta/status/1",
  publishedAt: new Date("2026-10-28T13:20:00.000Z"),
  source: "x:mrtjakarta",
  sourceType: "social",
  externalId: "1",
  systemHint: "mrt-jakarta",
  images: [1, 2, 3, 4].map((index) => ({
    url: `https://pbs.twimg.com/media/announcement-${index}.jpg`,
    altText: `Informasi layanan ${index}`,
  })),
};

describe("classificationPrompt", () => {
  it("sends every attached image as an image part, not as prose", () => {
    const message = classificationPrompt(input, [], null);
    expect(typeof message).toBe("object");
    if (typeof message === "string") throw new Error("expected a user message");

    const text = message.content.find((part) => part.type === "text");
    const images = message.content.filter((part) => part.type === "image");
    expect(text?.type === "text" ? text.text : "").toContain("berisi gambar");
    expect(images).toHaveLength(4);
    expect(images[0]).toEqual({
      type: "image",
      image: { type: "url", url: "https://pbs.twimg.com/media/announcement-1.jpg" },
      detail: "high",
    });
    expect(
      images.map((part) =>
        part.type === "image" && part.image.type === "url" ? part.image.url : "",
      ),
    ).toEqual([1, 2, 3, 4].map((index) => `https://pbs.twimg.com/media/announcement-${index}.jpg`));
  });

  it("stays a plain string when there is no image", () => {
    const message = classificationPrompt({ ...input, images: undefined }, [], null);
    expect(typeof message).toBe("string");
  });
});
