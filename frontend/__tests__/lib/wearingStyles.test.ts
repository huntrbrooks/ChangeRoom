import { getWearingStyleOptions } from "@/lib/wearingStyles";

describe("wearingStyles", () => {
  it("returns outerwear options for jackets even when category is upper_body", () => {
    const opts = getWearingStyleOptions("upper_body", "black leather jacket");
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.map((o) => o.value)).toEqual(expect.arrayContaining(["open", "closed"]));
  });

  it("supports legacy/uppercase categories via caller normalization", () => {
    // getWearingStyleOptions normalizes case; callers may pass uppercase categories from older data.
    const opts = getWearingStyleOptions("SHOES", "boots");
    expect(opts.length).toBeGreaterThan(0);
  });
});


