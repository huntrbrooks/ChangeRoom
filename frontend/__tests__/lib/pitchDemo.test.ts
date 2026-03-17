import {
  buildDemoAnalyses,
  getDemoTryOnImageUrl,
  getDemoTryOnProducts,
} from "@/lib/pitchDemo";

describe("buildDemoAnalyses", () => {
  it("creates local fallback metadata for uploads", () => {
    const files = [
      new File(["one"], "black-dress.jpg", { type: "image/jpeg" }),
      new File(["two"], "blue-jeans.png", { type: "image/png" }),
    ];

    const analyses = buildDemoAnalyses(files, 3);

    expect(analyses).toHaveLength(2);
    expect(analyses[0]).toMatchObject({
      index: 3,
      original_filename: "black-dress.jpg",
      status: "success",
      analysis: expect.objectContaining({
        category: "full_body",
        color: "black",
        brand: "Demo upload",
      }),
    });
    expect(analyses[1]).toMatchObject({
      index: 4,
      analysis: expect.objectContaining({
        category: "lower_body",
        color: "blue",
      }),
    });
  });
});

describe("getDemoTryOnImageUrl", () => {
  it("returns the sample result asset with a cache-busting query", () => {
    expect(getDemoTryOnImageUrl(42)).toBe("/try-on-result.jpg?demo=42");
  });
});

describe("getDemoTryOnProducts", () => {
  it("returns pitch-safe sample shopping cards", () => {
    const products = getDemoTryOnProducts();

    expect(products).toHaveLength(3);
    expect(products[0]).toEqual(
      expect.objectContaining({
        title: expect.any(String),
        price: expect.any(String),
        link: "/pricing",
        thumbnail: expect.stringContaining("/"),
        source: "Demo boutique",
      })
    );
  });
});
