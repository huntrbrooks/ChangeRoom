import type { PartnerProduct, PartnerVariant, PitchCatalog } from "./schemas";
import { partnerProductSchema, sizeSystemSchema } from "./schemas";

type CsvRow = Record<string, string>;

const FIELD_ALIASES = {
  productId: ["externalProductId", "external_product_id", "Handle", "handle", "id", "Item Group Id"],
  title: ["title", "Title"],
  brand: ["brand", "Brand", "Vendor", "vendor"],
  category: ["category", "Category", "Type", "product_type", "google_product_category"],
  imageUrl: ["imageUrl", "image_url", "Image Src", "image_link"],
  sizeLabel: ["sizeLabel", "size_label", "size", "Option1 Value", "option1_value"],
  sizeSystem: ["sizeSystem", "size_system"],
  sizeType: ["sizeType", "size_type"],
  material: ["material", "Material"],
  stretch: ["stretch", "Stretch"],
  genderTarget: ["gender", "genderTarget", "gender_target"],
  variantId: ["externalVariantId", "external_variant_id", "Variant SKU", "variant_sku", "sku"],
  sku: ["sku", "SKU", "Variant SKU", "variant_sku"],
  availability: ["available", "availability", "Variant Inventory Qty", "variant_inventory_qty"],
  fitNotes: ["fitNotes", "fit_notes", "Variant Description", "variant_description"],
  bustMin: ["bustMin", "bust_min"],
  bustMax: ["bustMax", "bust_max"],
  waistMin: ["waistMin", "waist_min"],
  waistMax: ["waistMax", "waist_max"],
  hipsMin: ["hipsMin", "hips_min"],
  hipsMax: ["hipsMax", "hips_max"],
  inseamMin: ["inseamMin", "inseam_min"],
  inseamMax: ["inseamMax", "inseam_max"],
} as const;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

export function parseCsvText(csvText: string): CsvRow[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<CsvRow>((row, header, index) => {
      row[header] = values[index] || "";
      return row;
    }, {});
  });
}

function readField(row: CsvRow, aliases: readonly string[]): string | undefined {
  for (const alias of aliases) {
    const value = row[alias];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function toOptionalNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toAvailable(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  if (normalized === "in stock" || normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "out of stock" || normalized === "false" || normalized === "no") {
    return false;
  }
  const numeric = Number(normalized);
  return !Number.isFinite(numeric) || numeric > 0;
}

function inferCategory(rawValue: string | undefined, title: string): PartnerProduct["category"] {
  const haystack = `${rawValue || ""} ${title}`.toLowerCase();
  if (haystack.includes("dress")) {
    return "dress";
  }
  return "womens-top";
}

function inferStretch(rawValue: string | undefined): PartnerProduct["stretch"] | undefined {
  const normalized = (rawValue || "").toLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes("high")) return "high";
  if (normalized.includes("medium")) return "medium";
  if (normalized.includes("low")) return "low";
  if (normalized.includes("stretch")) return "medium";
  return undefined;
}

function inferSizeSystem(rawValue: string | undefined): PartnerVariant["sizeSystem"] | undefined {
  if (!rawValue) return undefined;
  const candidate = rawValue.toUpperCase();
  const parsed = sizeSystemSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

function buildVariant(row: CsvRow, productId: string, index: number): PartnerVariant | null {
  const sizeLabel = readField(row, FIELD_ALIASES.sizeLabel);
  if (!sizeLabel) {
    return null;
  }

  const dimensions = {
    bustMin: toOptionalNumber(readField(row, FIELD_ALIASES.bustMin)),
    bustMax: toOptionalNumber(readField(row, FIELD_ALIASES.bustMax)),
    waistMin: toOptionalNumber(readField(row, FIELD_ALIASES.waistMin)),
    waistMax: toOptionalNumber(readField(row, FIELD_ALIASES.waistMax)),
    hipsMin: toOptionalNumber(readField(row, FIELD_ALIASES.hipsMin)),
    hipsMax: toOptionalNumber(readField(row, FIELD_ALIASES.hipsMax)),
    inseamMin: toOptionalNumber(readField(row, FIELD_ALIASES.inseamMin)),
    inseamMax: toOptionalNumber(readField(row, FIELD_ALIASES.inseamMax)),
  };

  const hasDimensions = Object.values(dimensions).some((value) => typeof value === "number");

  return {
    externalVariantId:
      readField(row, FIELD_ALIASES.variantId) || `${productId}-variant-${index + 1}`,
    sizeLabel,
    sizeSystem: inferSizeSystem(readField(row, FIELD_ALIASES.sizeSystem)),
    available: toAvailable(readField(row, FIELD_ALIASES.availability)),
    sku: readField(row, FIELD_ALIASES.sku),
    dimensions: hasDimensions ? dimensions : undefined,
    fitNotes: readField(row, FIELD_ALIASES.fitNotes),
  };
}

function computeMissingFields(product: Omit<PartnerProduct, "completenessScore" | "missingFields">): string[] {
  const missing: string[] = [];
  if (!product.sizeSystem) missing.push("sizeSystem");
  if (!product.sizeType) missing.push("sizeType");
  if (!product.material) missing.push("material");
  if (!product.stretch) missing.push("stretch");
  if (!product.images[0]) missing.push("image");
  if (!product.variants.some((variant) => variant.dimensions)) {
    missing.push("variantDimensions");
  }
  return missing;
}

export function normalizePartnerCsv(args: {
  brandName?: string;
  csvText: string;
  sourceType: PitchCatalog["sourceType"];
}): PitchCatalog {
  const rows = parseCsvText(args.csvText);
  if (rows.length === 0) {
    throw new Error("The CSV did not contain any product rows.");
  }

  const grouped = new Map<string, { product: Omit<PartnerProduct, "completenessScore" | "missingFields">; variants: PartnerVariant[] }>();
  let rejectedRows = 0;

  rows.forEach((row) => {
    const title = readField(row, FIELD_ALIASES.title);
    const productId = readField(row, FIELD_ALIASES.productId) || (title ? slugify(title) : undefined);
    if (!title || !productId) {
      rejectedRows += 1;
      return;
    }

    const brandName =
      args.brandName || readField(row, FIELD_ALIASES.brand) || "Pitch Demo Brand";
    const category = inferCategory(readField(row, FIELD_ALIASES.category), title);
    const imageUrl = readField(row, FIELD_ALIASES.imageUrl) || "/placeholder-clothing.svg";
    const baseSizeSystem = inferSizeSystem(readField(row, FIELD_ALIASES.sizeSystem)) || "AU";

    if (!grouped.has(productId)) {
      grouped.set(productId, {
        product: {
          id: productId,
          brand: brandName,
          externalProductId: productId,
          title,
          category,
          images: [imageUrl],
          variants: [],
          sizeSystem: baseSizeSystem,
          sizeType: readField(row, FIELD_ALIASES.sizeType),
          material: readField(row, FIELD_ALIASES.material),
          stretch: inferStretch(readField(row, FIELD_ALIASES.stretch)),
          genderTarget: "female",
        },
        variants: [],
      });
    }

    const current = grouped.get(productId);
    if (!current) {
      rejectedRows += 1;
      return;
    }

    const variant = buildVariant(row, productId, current.variants.length);
    if (!variant) {
      rejectedRows += 1;
      return;
    }

    current.variants.push(variant);
  });

  const products = Array.from(grouped.values()).map(({ product, variants }) => {
    const normalized = {
      ...product,
      variants,
    };
    const missingFields = computeMissingFields(normalized);
    return partnerProductSchema.parse({
      ...normalized,
      completenessScore: Math.max(40, 100 - missingFields.length * 15),
      missingFields,
    });
  });

  const brandName = args.brandName || products[0]?.brand || "Pitch Demo Brand";

  return {
    brandSlug: slugify(brandName),
    brandName,
    sourceType: args.sourceType,
    categoryLane: "womens-tops-and-dresses",
    importedAt: new Date().toISOString(),
    products,
    totalRows: rows.length,
    rejectedRows,
  };
}
