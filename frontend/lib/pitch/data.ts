import { randomUUID } from "crypto";

import { sql } from "@/lib/db";

import { PITCH_DEMO_CATALOG } from "./sampleCatalog";
import type { FitRecommendation, MeasurementProfile, PartnerProduct, PitchCatalog } from "./schemas";

type CatalogRow = {
  brand_slug: string;
  brand_name: string;
  source_type: PitchCatalog["sourceType"];
  category_lane: PitchCatalog["categoryLane"];
  imported_at: Date | string;
  total_rows: number | string;
  rejected_rows: number | string;
};

type ProductRow = {
  id: string;
  brand_slug: string;
  product_json: unknown;
};

type SessionRow = {
  id: string;
  brand_slug: string;
  product_id: string;
  product_title: string;
  recommended_size_label: string;
  fit_confidence: FitRecommendation["confidence"];
  reasoning: string;
  result_image_url: string | null;
  status: string;
  shopper_name: string | null;
  measurement_profile: unknown;
  created_at: Date | string;
};

export type PitchDashboard = {
  brandSlug: string;
  brandName: string;
  sourceType: PitchCatalog["sourceType"];
  importedAt: string;
  productsImported: number;
  variantsImported: number;
  sizeCoveragePercent: number;
  fitReadyProducts: number;
  catalogQualityScore: number;
  metadataAlerts: Array<{ field: string; count: number }>;
  recentSessions: Array<{
    id: string;
    productTitle: string;
    recommendedSizeLabel: string;
    fitConfidence: FitRecommendation["confidence"];
    shopperName: string | null;
    resultImageUrl: string | null;
    createdAt: string;
  }>;
  tryOnCompletionRate: number;
};

let tablesReady: Promise<void> | null = null;

function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

async function createTables(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS pitch_demo_catalogs (
      brand_slug TEXT PRIMARY KEY,
      brand_name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      category_lane TEXT NOT NULL,
      imported_at TIMESTAMPTZ NOT NULL,
      total_rows INTEGER NOT NULL,
      rejected_rows INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS pitch_demo_products (
      id TEXT PRIMARY KEY,
      brand_slug TEXT NOT NULL,
      product_json JSONB NOT NULL,
      completeness_score INTEGER NOT NULL DEFAULT 0,
      missing_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS pitch_demo_products_brand_idx
    ON pitch_demo_products (brand_slug)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS pitch_demo_sessions (
      id TEXT PRIMARY KEY,
      brand_slug TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_title TEXT NOT NULL,
      recommended_size_label TEXT NOT NULL,
      fit_confidence TEXT NOT NULL,
      reasoning TEXT NOT NULL,
      result_image_url TEXT,
      status TEXT NOT NULL,
      shopper_name TEXT,
      measurement_profile JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS pitch_demo_sessions_brand_created_idx
    ON pitch_demo_sessions (brand_slug, created_at DESC)
  `;
}

async function ensureTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = createTables().catch((error) => {
      tablesReady = null;
      throw error;
    });
  }
  return tablesReady;
}

function buildCatalog(row: CatalogRow, productRows: ProductRow[]): PitchCatalog {
  return {
    brandSlug: row.brand_slug,
    brandName: row.brand_name,
    sourceType: row.source_type,
    categoryLane: row.category_lane,
    importedAt:
      row.imported_at instanceof Date ? row.imported_at.toISOString() : new Date(row.imported_at).toISOString(),
    products: productRows
      .map((productRow) => parseJson<PartnerProduct | null>(productRow.product_json, null))
      .filter((product): product is PartnerProduct => Boolean(product)),
    totalRows: toNumber(row.total_rows),
    rejectedRows: toNumber(row.rejected_rows),
  };
}

export async function importPitchCatalog(catalog: PitchCatalog): Promise<PitchCatalog> {
  await ensureTables();

  await sql`
    INSERT INTO pitch_demo_catalogs (
      brand_slug,
      brand_name,
      source_type,
      category_lane,
      imported_at,
      total_rows,
      rejected_rows,
      updated_at
    )
    VALUES (
      ${catalog.brandSlug},
      ${catalog.brandName},
      ${catalog.sourceType},
      ${catalog.categoryLane},
      ${catalog.importedAt},
      ${catalog.totalRows},
      ${catalog.rejectedRows},
      now()
    )
    ON CONFLICT (brand_slug)
    DO UPDATE SET
      brand_name = EXCLUDED.brand_name,
      source_type = EXCLUDED.source_type,
      category_lane = EXCLUDED.category_lane,
      imported_at = EXCLUDED.imported_at,
      total_rows = EXCLUDED.total_rows,
      rejected_rows = EXCLUDED.rejected_rows,
      updated_at = now()
  `;

  await sql`DELETE FROM pitch_demo_products WHERE brand_slug = ${catalog.brandSlug}`;

  for (const product of catalog.products) {
    await sql`
      INSERT INTO pitch_demo_products (
        id,
        brand_slug,
        product_json,
        completeness_score,
        missing_fields,
        updated_at
      )
      VALUES (
        ${product.id},
        ${catalog.brandSlug},
        ${JSON.stringify(product)}::jsonb,
        ${product.completenessScore},
        ${JSON.stringify(product.missingFields)}::jsonb,
        now()
      )
      ON CONFLICT (id)
      DO UPDATE SET
        brand_slug = EXCLUDED.brand_slug,
        product_json = EXCLUDED.product_json,
        completeness_score = EXCLUDED.completeness_score,
        missing_fields = EXCLUDED.missing_fields,
        updated_at = now()
    `;
  }

  return catalog;
}

export async function ensurePitchSeedCatalog(): Promise<PitchCatalog> {
  await ensureTables();

  const seededCatalogRows = await sql<CatalogRow>`
    SELECT *
    FROM pitch_demo_catalogs
    WHERE brand_slug = ${PITCH_DEMO_CATALOG.brandSlug}
    LIMIT 1
  `;

  if (seededCatalogRows.rows[0]) {
    const latest = seededCatalogRows.rows[0];
    const productRows = await sql<ProductRow>`
      SELECT id, brand_slug, product_json
      FROM pitch_demo_products
      WHERE brand_slug = ${latest.brand_slug}
      ORDER BY id
    `;
    return buildCatalog(latest, productRows.rows);
  }

  return importPitchCatalog(PITCH_DEMO_CATALOG);
}

export async function getPitchCatalog(brandSlug?: string): Promise<PitchCatalog> {
  const fallbackCatalog = await ensurePitchSeedCatalog();
  const targetSlug = brandSlug || PITCH_DEMO_CATALOG.brandSlug;

  const catalogRows = await sql<CatalogRow>`
    SELECT *
    FROM pitch_demo_catalogs
    WHERE brand_slug = ${targetSlug}
    LIMIT 1
  `;

  const catalogRow = catalogRows.rows[0];
  if (!catalogRow) {
    if (targetSlug === PITCH_DEMO_CATALOG.brandSlug) {
      return fallbackCatalog;
    }
    return getPitchCatalog(PITCH_DEMO_CATALOG.brandSlug);
  }

  const productRows = await sql<ProductRow>`
    SELECT id, brand_slug, product_json
    FROM pitch_demo_products
    WHERE brand_slug = ${targetSlug}
    ORDER BY id
  `;

  return buildCatalog(catalogRow, productRows.rows);
}

export async function getPitchProduct(
  brandSlug: string,
  productId: string
): Promise<PartnerProduct | null> {
  await ensurePitchSeedCatalog();
  const rows = await sql<ProductRow>`
    SELECT id, brand_slug, product_json
    FROM pitch_demo_products
    WHERE brand_slug = ${brandSlug} AND id = ${productId}
    LIMIT 1
  `;
  const row = rows.rows[0];
  if (!row) {
    return null;
  }
  return parseJson<PartnerProduct | null>(row.product_json, null);
}

export async function createPitchSession(input: {
  brandSlug: string;
  productId: string;
  productTitle: string;
  shopperName?: string;
  profile: MeasurementProfile;
  recommendation: FitRecommendation;
  resultImageUrl: string | null;
  status: "completed" | "failed";
}): Promise<void> {
  await ensureTables();

  await sql`
    INSERT INTO pitch_demo_sessions (
      id,
      brand_slug,
      product_id,
      product_title,
      recommended_size_label,
      fit_confidence,
      reasoning,
      result_image_url,
      status,
      shopper_name,
      measurement_profile
    )
    VALUES (
      ${randomUUID()},
      ${input.brandSlug},
      ${input.productId},
      ${input.productTitle},
      ${input.recommendation.recommendedSizeLabel},
      ${input.recommendation.confidence},
      ${input.recommendation.reasoning},
      ${input.resultImageUrl},
      ${input.status},
      ${input.shopperName || null},
      ${JSON.stringify(input.profile)}::jsonb
    )
  `;
}

export async function getPitchDashboard(brandSlug?: string): Promise<PitchDashboard> {
  const catalog = await getPitchCatalog(brandSlug);
  const sessions = await sql<SessionRow>`
    SELECT *
    FROM pitch_demo_sessions
    WHERE brand_slug = ${catalog.brandSlug}
    ORDER BY created_at DESC
    LIMIT 25
  `;

  const variantCount = catalog.products.reduce((total, product) => total + product.variants.length, 0);
  const variantWithSizeSystem = catalog.products.reduce(
    (total, product) =>
      total + product.variants.filter((variant) => Boolean(variant.sizeSystem || product.sizeSystem)).length,
    0
  );
  const metadataAlertCounts = catalog.products.reduce<Record<string, number>>((counts, product) => {
    for (const field of product.missingFields) {
      counts[field] = (counts[field] || 0) + 1;
    }
    return counts;
  }, {});
  const completedSessions = sessions.rows.filter((session) => session.status === "completed").length;

  return {
    brandSlug: catalog.brandSlug,
    brandName: catalog.brandName,
    sourceType: catalog.sourceType,
    importedAt: catalog.importedAt,
    productsImported: catalog.products.length,
    variantsImported: variantCount,
    sizeCoveragePercent:
      variantCount > 0 ? Math.round((variantWithSizeSystem / variantCount) * 100) : 0,
    fitReadyProducts: catalog.products.filter((product) =>
      product.variants.some((variant) => variant.dimensions)
    ).length,
    catalogQualityScore:
      catalog.products.length > 0
        ? Math.round(
            catalog.products.reduce((total, product) => total + product.completenessScore, 0) /
              catalog.products.length
          )
        : 0,
    metadataAlerts: Object.entries(metadataAlertCounts)
      .map(([field, count]) => ({ field, count }))
      .sort((left, right) => right.count - left.count),
    recentSessions: sessions.rows.slice(0, 5).map((session) => ({
      id: session.id,
      productTitle: session.product_title,
      recommendedSizeLabel: session.recommended_size_label,
      fitConfidence: session.fit_confidence,
      shopperName: session.shopper_name,
      resultImageUrl: session.result_image_url,
      createdAt:
        session.created_at instanceof Date
          ? session.created_at.toISOString()
          : new Date(session.created_at).toISOString(),
    })),
    tryOnCompletionRate:
      sessions.rows.length > 0 ? Math.round((completedSessions / sessions.rows.length) * 100) : 0,
  };
}
