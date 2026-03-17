import { recommendSizeForProduct } from "@/lib/pitch/recommend";
import { PITCH_DEMO_CATALOG } from "@/lib/pitch/sampleCatalog";

describe("recommendSizeForProduct", () => {
  it("returns a high-confidence recommendation when dimensions are available", () => {
    const product = PITCH_DEMO_CATALOG.products[0];

    const recommendation = recommendSizeForProduct(product, {
      unitSystem: "metric",
      height: 170,
      weight: 65,
      chestBust: 91,
      waist: 73,
      hips: 98,
      inseam: 77,
      usualTopSize: "M",
      usualBottomSize: "M",
      fitPreference: "regular",
    });

    expect(recommendation.recommendedSizeLabel).toBe("M");
    expect(recommendation.confidence).toBe("high");
    expect(recommendation.reasoning).toContain("matches your chest and waist measurements");
  });

  it("falls back to usual size with low confidence when variant dimensions are missing", () => {
    const product = {
      ...PITCH_DEMO_CATALOG.products[0],
      variants: PITCH_DEMO_CATALOG.products[0].variants.map((variant) => ({
        ...variant,
        dimensions: undefined,
      })),
    };

    const recommendation = recommendSizeForProduct(product, {
      unitSystem: "metric",
      height: 168,
      weight: 62,
      chestBust: 89,
      waist: 70,
      hips: 95,
      inseam: 76,
      usualTopSize: "S",
      usualBottomSize: "S",
      fitPreference: "fitted",
    });

    expect(recommendation.recommendedSizeLabel).toBe("S");
    expect(recommendation.confidence).toBe("low");
  });

  it("maps AU numeric shopper sizes to a fitted numeric product", () => {
    const product = PITCH_DEMO_CATALOG.products.find(
      (entry) => entry.id === "frntrnr-nano-tee-black"
    );

    expect(product).toBeDefined();

    const recommendation = recommendSizeForProduct(product!, {
      unitSystem: "metric",
      height: 170,
      weight: 61,
      chestBust: 88,
      waist: 70,
      hips: 95,
      inseam: 77,
      usualTopSize: "10",
      usualBottomSize: "10",
      fitPreference: "regular",
    });

    expect(recommendation.recommendedSizeLabel).toBe("10");
    expect(recommendation.confidence).toBe("high");
  });

  it("understands Frontrunner's oversized unisex sizing aliases", () => {
    const product = PITCH_DEMO_CATALOG.products.find((entry) => entry.id === "atlas-tee-black");

    expect(product).toBeDefined();

    const recommendation = recommendSizeForProduct(product!, {
      unitSystem: "metric",
      height: 170,
      weight: 63,
      chestBust: 90,
      waist: 72,
      hips: 96,
      inseam: 77,
      usualTopSize: "10",
      usualBottomSize: "10",
      fitPreference: "regular",
    });

    expect(["XXS", "XS"]).toContain(recommendation.recommendedSizeLabel);
    expect(recommendation.reasoning).toContain("Front Runner");
  });
});
