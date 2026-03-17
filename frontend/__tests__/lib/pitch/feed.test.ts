import { normalizePartnerCsv } from "@/lib/pitch/feed";

describe("normalizePartnerCsv", () => {
  it("groups Shopify-style variant rows into normalized partner products", () => {
    const csvText = [
      "Handle,Title,Vendor,Type,Image Src,Option1 Value,Variant SKU,size_system,size_type,bust_min,bust_max,waist_min,waist_max",
      "rib-tank,Soft Sculpt Rib Tank,Aster Lane,Women Tops,/TRYON/Cloths/IMG_1084 2.jpg,S,AST-S,AU,regular,84,89,66,71",
      "rib-tank,Soft Sculpt Rib Tank,Aster Lane,Women Tops,/TRYON/Cloths/IMG_1084 2.jpg,M,AST-M,AU,regular,90,95,72,77",
    ].join("\n");

    const catalog = normalizePartnerCsv({
      brandName: "Aster Lane",
      csvText,
      sourceType: "shopify_csv",
    });

    expect(catalog.brandSlug).toBe("aster-lane");
    expect(catalog.products).toHaveLength(1);
    expect(catalog.products[0].title).toBe("Soft Sculpt Rib Tank");
    expect(catalog.products[0].category).toBe("womens-top");
    expect(catalog.products[0].variants).toHaveLength(2);
    expect(catalog.products[0].variants[1].sizeLabel).toBe("M");
    expect(catalog.products[0].variants[1].dimensions?.bustMin).toBe(90);
  });
});
