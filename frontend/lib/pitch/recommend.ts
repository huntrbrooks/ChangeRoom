import type {
  FitRecommendation,
  MeasurementProfile,
  PartnerProduct,
  PartnerVariant,
} from "./schemas";
import { fitRecommendationSchema } from "./schemas";

const SIZE_RANKS = new Map(
  [
    "4",
    "6",
    "8",
    "10",
    "12",
    "14",
    "16",
    "18",
    "XXS",
    "XS",
    "S",
    "M",
    "L",
    "XL",
    "2XL",
    "3XL",
    "4XL",
  ].map((label, index) => [label, index + 1])
);

const SIZE_ALIASES: Record<string, string> = {
  SML: "S",
  SM: "S",
  MED: "M",
  MD: "M",
  LGE: "L",
  LG: "L",
  XLG: "XL",
  "6-8": "8",
  "8-10": "10",
  "10-12": "12",
  "12-14": "14",
  "14-16": "16",
  "XX-LARGE": "2XL",
};

const WOMENS_AU_TO_ALPHA: Record<string, string> = {
  "4": "XXS",
  "6": "XS",
  "8": "S",
  "10": "M",
  "12": "L",
  "14": "XL",
  "16": "2XL",
  "18": "3XL",
};

function normalizeLabel(label: string): string {
  const normalized = label.trim().toUpperCase().replace(/\s+/g, "");
  return SIZE_ALIASES[normalized] || normalized;
}

function toComparableLabels(label: string): string[] {
  const normalized = normalizeLabel(label);
  const mappedAlpha = WOMENS_AU_TO_ALPHA[normalized];
  const mappedNumeric = Object.entries(WOMENS_AU_TO_ALPHA).find(
    ([, alphaLabel]) => alphaLabel === normalized
  )?.[0];

  return Array.from(new Set([normalized, mappedAlpha, mappedNumeric].filter(Boolean))) as string[];
}

function sizeRank(label: string): number | null {
  const comparable = toComparableLabels(label);
  for (const candidate of comparable) {
    const rank = SIZE_RANKS.get(candidate);
    if (rank) return rank;
  }
  return null;
}

function measurementWeight(product: PartnerProduct, key: "bust" | "waist" | "hips"): number {
  if (product.category === "dress") {
    if (key === "bust") return 1.2;
    if (key === "waist") return 1.1;
    return 0.9;
  }

  if (key === "bust") return 1.3;
  if (key === "waist") return 0.9;
  return 0.2;
}

function rangeScore(value: number, min?: number, max?: number): number | null {
  if (typeof min !== "number" || typeof max !== "number") {
    return null;
  }

  const midpoint = (min + max) / 2;
  const spread = Math.max(2, (max - min) / 2);
  const distance = Math.abs(value - midpoint);

  if (value >= min && value <= max) {
    return 100 - distance * 6;
  }

  return Math.max(20, 75 - ((distance - spread) / spread) * 24);
}

function sizeLabelScore(usualSize: string, candidateSize: string): number | null {
  const usualRank = sizeRank(usualSize);
  const candidateRank = sizeRank(candidateSize);
  if (!usualRank || !candidateRank) {
    return null;
  }

  return Math.max(45, 92 - Math.abs(usualRank - candidateRank) * 18);
}

function fitPreferenceAdjustment(profile: MeasurementProfile, variant: PartnerVariant): number {
  const rank = sizeRank(variant.sizeLabel);
  const preferred = sizeRank(profile.usualTopSize);

  if (!rank || !preferred) {
    return 0;
  }

  if (profile.fitPreference === "relaxed" && rank >= preferred) {
    return 6;
  }
  if (profile.fitPreference === "fitted" && rank <= preferred) {
    return 6;
  }
  return 0;
}

function buildReasoning(
  product: PartnerProduct,
  profile: MeasurementProfile,
  variant: PartnerVariant,
  confidence: FitRecommendation["confidence"]
): string {
  const preferenceText =
    profile.fitPreference === "relaxed"
      ? "relaxed fit preference"
      : profile.fitPreference === "fitted"
        ? "closer fit preference"
        : "regular fit preference";

  const fitContext = variant.fitNotes ? ` ${variant.fitNotes}` : "";

  if (variant.dimensions?.bustMin && variant.dimensions?.waistMin) {
    return `${variant.sizeLabel} matches your chest and waist measurements best for this ${product.brand} ${product.category === "dress" ? "dress" : "top"} with a ${preferenceText}, giving us ${confidence} confidence.${fitContext}`.slice(
      0,
      240
    );
  }

  return `${variant.sizeLabel} is the closest match to your usual size and the normalized ${product.sizeSystem || "AU"} sizing on this ${product.brand} product, so we’re returning ${confidence} confidence.${fitContext}`.slice(
    0,
    240
  );
}

export function recommendSizeForProduct(
  product: PartnerProduct,
  profile: MeasurementProfile
): FitRecommendation {
  const scored = product.variants.map((variant) => {
    const measureScores = [
      {
        score: rangeScore(profile.chestBust, variant.dimensions?.bustMin, variant.dimensions?.bustMax),
        weight: measurementWeight(product, "bust"),
      },
      {
        score: rangeScore(profile.waist, variant.dimensions?.waistMin, variant.dimensions?.waistMax),
        weight: measurementWeight(product, "waist"),
      },
      {
        score: rangeScore(profile.hips || profile.waist, variant.dimensions?.hipsMin, variant.dimensions?.hipsMax),
        weight: measurementWeight(product, "hips"),
      },
    ].filter((entry) => entry.score !== null) as Array<{ score: number; weight: number }>;

    const weightedScore =
      measureScores.length > 0
        ? measureScores.reduce((total, entry) => total + entry.score * entry.weight, 0) /
          measureScores.reduce((total, entry) => total + entry.weight, 0)
        : 0;

    const fallbackLabelScore = sizeLabelScore(profile.usualTopSize, variant.sizeLabel) || 60;
    const finalScore =
      (measureScores.length > 0 ? weightedScore : fallbackLabelScore) +
      fitPreferenceAdjustment(profile, variant);

    return {
      variant,
      score: finalScore,
      hasDimensions: measureScores.length > 0,
    };
  });

  scored.sort((left, right) => right.score - left.score);

  const best = scored[0];
  const alternates = scored.slice(1, 3);

  const confidence: FitRecommendation["confidence"] = best.hasDimensions
    ? profile.hips || product.category === "womens-top"
      ? "high"
      : "medium"
    : "low";

  return fitRecommendationSchema.parse({
    recommendedVariantId: best.variant.externalVariantId,
    recommendedSizeLabel: best.variant.sizeLabel,
    confidence,
    reasoning: buildReasoning(product, profile, best.variant, confidence),
    alternateSizes: alternates.map(({ variant }) => ({
      variantId: variant.externalVariantId,
      sizeLabel: variant.sizeLabel,
    })),
  });
}
