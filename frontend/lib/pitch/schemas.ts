import { z } from "zod";

export const sizeSystemSchema = z.enum(["AU", "UK", "US", "EU"]);
export const fitPreferenceSchema = z.enum(["fitted", "regular", "relaxed"]);
export const confidenceSchema = z.enum(["high", "medium", "low"]);

export const measurementProfileSchema = z.object({
  unitSystem: z.enum(["metric", "imperial"]).default("metric"),
  height: z.number().positive().max(250),
  weight: z.number().positive().max(300),
  chestBust: z.number().positive().max(200),
  waist: z.number().positive().max(200),
  hips: z.number().positive().max(220).optional(),
  inseam: z.number().positive().max(150).optional(),
  usualTopSize: z.string().trim().min(1).max(16),
  usualBottomSize: z.string().trim().min(1).max(16).optional(),
  fitPreference: fitPreferenceSchema,
});

export const variantDimensionsSchema = z
  .object({
    bustMin: z.number().positive().max(200).optional(),
    bustMax: z.number().positive().max(220).optional(),
    waistMin: z.number().positive().max(200).optional(),
    waistMax: z.number().positive().max(220).optional(),
    hipsMin: z.number().positive().max(220).optional(),
    hipsMax: z.number().positive().max(240).optional(),
    inseamMin: z.number().positive().max(150).optional(),
    inseamMax: z.number().positive().max(160).optional(),
  })
  .refine(
    (value) =>
      Object.values(value).some((entry) => typeof entry === "number" && Number.isFinite(entry)),
    { message: "At least one garment dimension is required." }
  );

export const partnerVariantSchema = z.object({
  externalVariantId: z.string().trim().min(1).max(120),
  sizeLabel: z.string().trim().min(1).max(32),
  sizeSystem: sizeSystemSchema.optional(),
  available: z.boolean().default(true),
  sku: z.string().trim().max(120).optional(),
  dimensions: variantDimensionsSchema.optional(),
  fitNotes: z.string().trim().max(240).optional(),
});

export const partnerProductSchema = z.object({
  id: z.string().trim().min(1).max(120),
  brand: z.string().trim().min(1).max(120),
  externalProductId: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(180),
  category: z.enum(["womens-top", "dress"]),
  images: z.array(z.string().trim().min(1)).min(1).max(5),
  variants: z.array(partnerVariantSchema).min(1).max(12),
  sizeSystem: sizeSystemSchema.optional(),
  sizeType: z.string().trim().max(32).optional(),
  material: z.string().trim().max(120).optional(),
  stretch: z.enum(["low", "medium", "high"]).optional(),
  genderTarget: z.enum(["female"]).default("female"),
  completenessScore: z.number().int().min(0).max(100).default(0),
  missingFields: z.array(z.string().trim().min(1).max(64)).default([]),
});

export const pitchCatalogSchema = z.object({
  brandSlug: z.string().trim().min(1).max(120),
  brandName: z.string().trim().min(1).max(120),
  sourceType: z.enum([
    "seed",
    "shopify_csv",
    "google_merchant",
    "partner_csv",
    "shopify_site_snapshot",
  ]),
  categoryLane: z.enum(["womens-tops-and-dresses", "womens-activewear-and-tees"]),
  importedAt: z.string().datetime(),
  products: z.array(partnerProductSchema).min(1),
  totalRows: z.number().int().min(1),
  rejectedRows: z.number().int().min(0),
});

export const fitRecommendationSchema = z.object({
  recommendedVariantId: z.string().trim().min(1).max(120),
  recommendedSizeLabel: z.string().trim().min(1).max(32),
  confidence: confidenceSchema,
  reasoning: z.string().trim().min(1).max(240),
  alternateSizes: z
    .array(
      z.object({
        variantId: z.string().trim().min(1).max(120),
        sizeLabel: z.string().trim().min(1).max(32),
      })
    )
    .max(3),
});

export const csvImportRequestSchema = z
  .object({
    brandName: z.string().trim().min(1).max(120).optional(),
    sourceType: z
      .enum(["shopify_csv", "google_merchant", "partner_csv"])
      .default("shopify_csv"),
    csvText: z.string().trim().min(1),
  })
  .strict();

export const seedCatalogRequestSchema = z
  .object({
    seed: z.enum(["womens-brand-demo", "frontrunner-site-demo"]),
  })
  .strict();

export const fitRecommendationRequestSchema = z
  .object({
    brandSlug: z.string().trim().min(1).max(120),
    productId: z.string().trim().min(1).max(120),
    profile: measurementProfileSchema,
  })
  .strict();

export type MeasurementProfile = z.infer<typeof measurementProfileSchema>;
export type PartnerVariant = z.infer<typeof partnerVariantSchema>;
export type PartnerProduct = z.infer<typeof partnerProductSchema>;
export type PitchCatalog = z.infer<typeof pitchCatalogSchema>;
export type FitRecommendation = z.infer<typeof fitRecommendationSchema>;
