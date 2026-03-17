import type { PartnerProduct, PartnerVariant, PitchCatalog } from "./schemas";

type VariantDimensions = NonNullable<PartnerVariant["dimensions"]>;

type SizingProfile = "active_letter" | "active_numeric" | "oversized_unisex";

type ProductSeed = {
  id: string;
  externalProductId: string;
  title: string;
  images: string[];
  sizeLabels: string[];
  sizingProfile: SizingProfile;
  material?: string;
  stretch?: PartnerProduct["stretch"];
  sizeType?: string;
  fitSummary: string;
  modelReference?: string;
  completenessPenalty?: number;
};

const ACTIVE_LETTER_DIMENSIONS: Record<string, VariantDimensions> = {
  XS: { bustMin: 78, bustMax: 83, waistMin: 61, waistMax: 66, hipsMin: 86, hipsMax: 91 },
  S: { bustMin: 84, bustMax: 89, waistMin: 67, waistMax: 72, hipsMin: 92, hipsMax: 97 },
  SML: { bustMin: 84, bustMax: 89, waistMin: 67, waistMax: 72, hipsMin: 92, hipsMax: 97 },
  M: { bustMin: 90, bustMax: 95, waistMin: 73, waistMax: 78, hipsMin: 98, hipsMax: 103 },
  MED: { bustMin: 90, bustMax: 95, waistMin: 73, waistMax: 78, hipsMin: 98, hipsMax: 103 },
  L: { bustMin: 96, bustMax: 101, waistMin: 79, waistMax: 84, hipsMin: 104, hipsMax: 109 },
  LGE: { bustMin: 96, bustMax: 101, waistMin: 79, waistMax: 84, hipsMin: 104, hipsMax: 109 },
  XL: { bustMin: 102, bustMax: 108, waistMin: 85, waistMax: 91, hipsMin: 110, hipsMax: 116 },
  XLG: { bustMin: 102, bustMax: 108, waistMin: 85, waistMax: 91, hipsMin: 110, hipsMax: 116 },
  "2XL": { bustMin: 109, bustMax: 116, waistMin: 92, waistMax: 99, hipsMin: 117, hipsMax: 124 },
};

const ACTIVE_NUMERIC_DIMENSIONS: Record<string, VariantDimensions> = {
  "6": { bustMin: 77, bustMax: 81, waistMin: 60, waistMax: 64, hipsMin: 85, hipsMax: 89 },
  "8": { bustMin: 82, bustMax: 86, waistMin: 65, waistMax: 69, hipsMin: 90, hipsMax: 94 },
  "10": { bustMin: 87, bustMax: 91, waistMin: 70, waistMax: 74, hipsMin: 95, hipsMax: 99 },
  "12": { bustMin: 92, bustMax: 96, waistMin: 75, waistMax: 79, hipsMin: 100, hipsMax: 104 },
  "14": { bustMin: 97, bustMax: 102, waistMin: 80, waistMax: 85, hipsMin: 105, hipsMax: 110 },
  "16": { bustMin: 103, bustMax: 108, waistMin: 86, waistMax: 91, hipsMin: 111, hipsMax: 116 },
};

const OVERSIZED_UNISEX_DIMENSIONS: Record<string, VariantDimensions> = {
  XXS: { bustMin: 84, bustMax: 89, waistMin: 68, waistMax: 73, hipsMin: 92, hipsMax: 97 },
  XS: { bustMin: 90, bustMax: 95, waistMin: 74, waistMax: 79, hipsMin: 98, hipsMax: 103 },
  SML: { bustMin: 96, bustMax: 101, waistMin: 80, waistMax: 85, hipsMin: 104, hipsMax: 109 },
  MED: { bustMin: 102, bustMax: 107, waistMin: 86, waistMax: 91, hipsMin: 110, hipsMax: 115 },
  LGE: { bustMin: 108, bustMax: 114, waistMin: 92, waistMax: 98, hipsMin: 116, hipsMax: 122 },
  XLG: { bustMin: 115, bustMax: 121, waistMin: 99, waistMax: 105, hipsMin: 123, hipsMax: 129 },
  "2XL": { bustMin: 122, bustMax: 129, waistMin: 106, waistMax: 113, hipsMin: 130, hipsMax: 137 },
  "3XL": { bustMin: 130, bustMax: 137, waistMin: 114, waistMax: 121, hipsMin: 138, hipsMax: 145 },
  "4XL": { bustMin: 138, bustMax: 145, waistMin: 122, waistMax: 129, hipsMin: 146, hipsMax: 153 },
};

const FRONTRUNNER_PRODUCTS: ProductSeed[] = [
  {
    id: "forme-contour-tank-teal",
    externalProductId: "forme-contour-tank-teal",
    title: "Forme Contour Tank - Teal",
    images: [
      "https://cdn.shopify.com/s/files/1/0278/7950/5989/files/1_7d9e2b48-9b1c-4318-a242-ba39ebd0130e.jpg?v=1771204332",
      "https://cdn.shopify.com/s/files/1/0278/7950/5989/files/2_b49175d5-c571-4cbe-8831-357fda516b5e.jpg?v=1771204332",
    ],
    sizeLabels: ["XS", "S", "M", "L", "XL", "2XL"],
    sizingProfile: "active_letter",
    material: "Ribbed nylon-spandex performance knit",
    stretch: "high",
    sizeType: "regular",
    fitSummary:
      "Sculpted active tank with supportive stretch and a close fit through the bust and torso.",
  },
  {
    id: "sculpt-fx-seamless-crop-black",
    externalProductId: "sculpt-fx-seamless-crop-black",
    title: "Sculpt FX Seamless Crop - Black",
    images: [
      "https://cdn.shopify.com/s/files/1/0278/7950/5989/files/1_292ca714-119b-40b2-bd2e-c48789dae932.jpg?v=1770853729",
      "https://cdn.shopify.com/s/files/1/0278/7950/5989/files/2_34f40e88-b1f5-4e14-a0d0-a39f61ddfdf4.jpg?v=1770853730",
    ],
    sizeLabels: ["XS", "SML", "MED", "LGE", "XLG"],
    sizingProfile: "active_letter",
    material: "Seamless contour compression knit",
    stretch: "high",
    sizeType: "fitted",
    fitSummary: "Performance crop with compressive support and a body-hugging silhouette.",
  },
  {
    id: "fr-racer-crop-scarlet",
    externalProductId: "fr-racer-crop-scarlet",
    title: "FR Racer Crop - Scarlet",
    images: [
      "https://cdn.shopify.com/s/files/1/0278/7950/5989/files/13_29ca978a-b64e-4c10-9646-0ff1b75ead17.jpg?v=1764559252",
      "https://cdn.shopify.com/s/files/1/0278/7950/5989/files/6_cc853834-6a77-47c0-b0ee-4f3d84738c31.jpg?v=1764559252",
    ],
    sizeLabels: ["XS", "S", "M", "L", "XL", "2XL"],
    sizingProfile: "active_letter",
    material: "Premium rib performance fabric",
    stretch: "high",
    sizeType: "fitted",
    fitSummary: "Racerback crop designed for training support with a firm, flattering fit.",
  },
  {
    id: "frntrnr-halter-crop-black",
    externalProductId: "frntrnr-halter-crop-black",
    title: "FRNTRNR Halter Crop - Black",
    images: [
      "https://cdn.shopify.com/s/files/1/0278/7950/5989/files/1_398c680a-e76e-4ee5-b973-0553170145ff.jpg?v=1764641394",
      "https://cdn.shopify.com/s/files/1/0278/7950/5989/files/2_020471e3-14ff-45c5-97ad-816b24d5296d.jpg?v=1755737717",
    ],
    sizeLabels: ["XS", "S", "M", "L", "XL", "2XL"],
    sizingProfile: "active_letter",
    material: "Breathable sculpting activewear blend",
    stretch: "high",
    sizeType: "regular",
    fitSummary: "Standard fit. Front Runner recommends taking your regular size.",
    modelReference: "Lilly (170cm) wears XS on site.",
  },
  {
    id: "frntrnr-nano-tee-black",
    externalProductId: "frntrnr-nano-tee-black",
    title: "FRNTRNR Nano Tee - Black",
    images: [
      "https://cdn.shopify.com/s/files/1/0278/7950/5989/files/3_5f8ec503-2c50-4a66-a0c0-3b7bc6efb84d.jpg?v=1765415688",
      "https://cdn.shopify.com/s/files/1/0278/7950/5989/files/8_f611f98a-1420-4c09-83c4-c2edf13af0f8.jpg?v=1765415688",
    ],
    sizeLabels: ["6", "8", "10", "12", "14", "16"],
    sizingProfile: "active_numeric",
    material: "Midweight cotton elastane blend",
    stretch: "medium",
    sizeType: "fitted",
    fitSummary:
      "Standard fit. Front Runner calls this true to size with a fitted body and cap sleeve.",
    modelReference: "Lilly (170cm) wears size 6 and Dom (170cm) wears size 8 on site.",
  },
  {
    id: "steelheart-tank-washed-black",
    externalProductId: "steelheart-tank-washed-black",
    title: "Steelheart Tank - Washed Black",
    images: [
      "https://cdn.shopify.com/s/files/1/0278/7950/5989/files/1_e88f7a9b-567e-47ec-b65d-d55084ef24dd.jpg?v=1765854796",
      "https://cdn.shopify.com/s/files/1/0278/7950/5989/files/2_ff915453-f0d1-4b1f-9f2a-901431a1faab.jpg?v=1765854796",
    ],
    sizeLabels: ["6", "8", "10", "12", "14", "16"],
    sizingProfile: "active_numeric",
    material: "Vintage-washed cotton elastane jersey",
    stretch: "medium",
    sizeType: "fitted",
    fitSummary: "Clean sculpted tank with a close fit through the chest and torso.",
  },
  {
    id: "tattoo-nano-tee-vanilla",
    externalProductId: "tattoo-nano-tee-vanilla",
    title: "Tattoo Nano Tee - Vanilla",
    images: [
      "https://cdn.shopify.com/s/files/1/0278/7950/5989/files/14_27547033-8999-4f25-81b5-f3659ef1498c.jpg?v=1746251832",
      "https://cdn.shopify.com/s/files/1/0278/7950/5989/files/11_72e76565-f3f6-4eb5-abaf-6d72133e038a.jpg?v=1746251832",
    ],
    sizeLabels: ["6", "8", "10", "12", "14", "16"],
    sizingProfile: "active_numeric",
    material: "Structured cotton elastane blend",
    stretch: "medium",
    sizeType: "fitted",
    fitSummary: "Fitted nano tee with graphic detailing and true-to-size styling.",
  },
  {
    id: "tribe-nano-tee-washed-black",
    externalProductId: "tribe-nano-tee-washed-black",
    title: "Tribe Nano Tee - Washed Black",
    images: [
      "https://cdn.shopify.com/s/files/1/0278/7950/5989/files/3_5b513f10-dc5a-460f-929b-f41f91667f6c.jpg?v=1746252526",
      "https://cdn.shopify.com/s/files/1/0278/7950/5989/files/4_28e9aaa7-c773-4d1c-b75f-1d8e23ba3a97.jpg?v=1746252526",
    ],
    sizeLabels: ["6", "8", "10", "12", "14", "16"],
    sizingProfile: "active_numeric",
    material: "Midweight cotton elastane blend",
    stretch: "medium",
    sizeType: "fitted",
    fitSummary: "Structured women’s nano tee with a close fit and light stretch.",
  },
  {
    id: "fracture-l-s-top-black",
    externalProductId: "fracture-l-s-top-black",
    title: "Fracture L/S Top - Black",
    images: [
      "https://cdn.shopify.com/s/files/1/0278/7950/5989/files/1_5b0426cb-d38a-49e4-a42e-9fd43d08785d.jpg?v=1765408779",
      "https://cdn.shopify.com/s/files/1/0278/7950/5989/files/2_6344a1be-5e99-4681-a7f5-cd82584a6a12.jpg?v=1765408779",
    ],
    sizeLabels: ["XXS", "XS", "SML", "MED", "LGE", "XLG", "2XL", "3XL"],
    sizingProfile: "oversized_unisex",
    material: "Lightweight soft jersey",
    stretch: "medium",
    sizeType: "unisex",
    fitSummary:
      "Standard fit on site, but Front Runner notes the unisex cut runs oversized and is best 1 to 2 sizes down for a closer fit.",
    modelReference: "Lilly (170cm) wears XS and Eitan (188cm) wears SML on site.",
  },
  {
    id: "atelier-singlet-chocolate",
    externalProductId: "atelier-singlet-chocolate",
    title: "Atelier Singlet - Chocolate",
    images: [
      "https://cdn.shopify.com/s/files/1/0278/7950/5989/files/1_e97552d0-5c21-4a74-9fc5-f2b980100258.jpg?v=1771540947",
      "https://cdn.shopify.com/s/files/1/0278/7950/5989/files/5_ca04d2b4-fa7a-44b7-b8ce-0737e7db6018.jpg?v=1771540947",
    ],
    sizeLabels: ["XXS", "XS", "SML", "MED", "LGE", "XLG", "2XL", "3XL"],
    sizingProfile: "active_letter",
    material: "Textured cotton jersey",
    stretch: "medium",
    sizeType: "regular",
    fitSummary: "Standard fit. Front Runner recommends taking your regular size.",
    modelReference: "Alex (187cm) and Matt (180cm) both wear LGE on site.",
  },
  {
    id: "atlas-tee-black",
    externalProductId: "atlas-tee-black",
    title: "Atlas Tee - Black",
    images: [
      "https://cdn.shopify.com/s/files/1/0278/7950/5989/files/5_5e6aedaf-e315-47b6-8345-31c6c167afb8.jpg?v=1772058318",
      "https://cdn.shopify.com/s/files/1/0278/7950/5989/files/2_c28ad837-d899-474a-a12f-41091c7a4dcb.jpg?v=1772058318",
    ],
    sizeLabels: ["XXS", "XS", "SML", "MED", "LGE", "XLG", "2XL", "3XL", "4XL"],
    sizingProfile: "oversized_unisex",
    material: "Heavyweight cotton",
    stretch: "low",
    sizeType: "unisex",
    fitSummary: "Runs large. Front Runner recommends going 1 to 2 sizes down for a more fitted look.",
    modelReference: "Jaden (182cm) wears LGE and Mim (161cm) wears MED on site.",
  },
  {
    id: "runner-x-ls-reignforce-jersey-black-mandarin",
    externalProductId: "runner-x-ls-reignforce-jersey-black-mandarin",
    title: "Runner X LS Reignforce Jersey - Black Mandarin",
    images: [
      "https://cdn.shopify.com/s/files/1/0278/7950/5989/files/2_20d27e1c-4cec-44db-a19e-1a42e1411d97.jpg?v=1771901209",
      "https://cdn.shopify.com/s/files/1/0278/7950/5989/files/3_f9c87b2b-71bf-4cfc-8ba6-a578a0145080.jpg?v=1771901209",
    ],
    sizeLabels: ["XXS", "XS", "SML", "MED", "LGE", "XLG", "2XL", "3XL"],
    sizingProfile: "oversized_unisex",
    material: "Heavyweight jersey with a soft hand feel",
    stretch: "low",
    sizeType: "unisex",
    fitSummary:
      "Oversized boxy jersey. Front Runner recommends sizing down 1 to 2 sizes for a more fitted look.",
    modelReference: "Jaden (182cm) wears LGE and Mim (161cm) wears MED on site.",
  },
];

function dimensionsForSize(label: string, profile: SizingProfile): VariantDimensions | undefined {
  if (profile === "active_letter") {
    return ACTIVE_LETTER_DIMENSIONS[label];
  }
  if (profile === "active_numeric") {
    return ACTIVE_NUMERIC_DIMENSIONS[label];
  }
  return OVERSIZED_UNISEX_DIMENSIONS[label];
}

function buildVariant(seed: ProductSeed, sizeLabel: string): PartnerVariant {
  const dimensions = dimensionsForSize(sizeLabel, seed.sizingProfile);
  const variantId = `${seed.id}-${sizeLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return {
    externalVariantId: variantId,
    sizeLabel,
    sizeSystem: "AU",
    available: true,
    sku: variantId.toUpperCase(),
    dimensions,
    fitNotes: [seed.fitSummary, seed.modelReference].filter(Boolean).join(" "),
  };
}

function buildProduct(seed: ProductSeed): PartnerProduct {
  const variants = seed.sizeLabels.map((sizeLabel) => buildVariant(seed, sizeLabel));
  const missingFields: string[] = [];

  if (!seed.sizeType) missingFields.push("sizeType");
  if (!seed.material) missingFields.push("material");
  if (!seed.stretch) missingFields.push("stretch");
  if (!variants.some((variant) => variant.dimensions)) {
    missingFields.push("variantDimensions");
  }

  const penalty = seed.completenessPenalty || 0;
  const completenessScore = Math.max(72, 100 - missingFields.length * 10 - penalty);

  return {
    id: seed.id,
    brand: "Front Runner",
    externalProductId: seed.externalProductId,
    title: seed.title,
    category: "womens-top",
    images: seed.images,
    variants,
    sizeSystem: "AU",
    sizeType: seed.sizeType,
    material: seed.material,
    stretch: seed.stretch,
    genderTarget: "female",
    completenessScore,
    missingFields,
  };
}

export const PITCH_DEMO_CATALOG: PitchCatalog = {
  brandSlug: "frontrunnerau-demo",
  brandName: "Front Runner",
  sourceType: "shopify_site_snapshot",
  categoryLane: "womens-activewear-and-tees",
  importedAt: new Date("2026-03-08T09:00:00.000Z").toISOString(),
  products: FRONTRUNNER_PRODUCTS.map(buildProduct),
  totalRows: FRONTRUNNER_PRODUCTS.reduce((total, product) => total + product.sizeLabels.length, 0),
  rejectedRows: 0,
};
