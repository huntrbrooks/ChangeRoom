import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { hasValidFrontrunnerDemoSession, FRONTRUNNER_DEMO_COOKIE_NAME } from "@/lib/frontrunnerDemoAccess";
import { resolveBackendApiUrl } from "@/lib/backend-url";
import { createPitchSession, getPitchProduct } from "@/lib/pitch/data";
import {
  fitRecommendationSchema,
  measurementProfileSchema,
} from "@/lib/pitch/schemas";

function buildBackendHeaders(): HeadersInit {
  const headers: HeadersInit = {};
  const apiKey = (process.env.BACKEND_API_KEY || "").trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function categoryForProduct(category: string): string {
  return category === "dress" ? "full_body" : "upper_body";
}

function toAbsoluteAssetUrl(origin: string, pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  return new URL(pathOrUrl, origin).toString();
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  ) {
    return true;
  }

  if (/^127\./.test(normalized) || /^10\./.test(normalized) || /^192\.168\./.test(normalized)) {
    return true;
  }

  const private172 = normalized.match(/^172\.(\d{1,3})\./);
  if (private172) {
    const secondOctet = Number(private172[1]);
    if (secondOctet >= 16 && secondOctet <= 31) {
      return true;
    }
  }

  return normalized === "169.254.169.254";
}

export async function POST(req: NextRequest) {
  if (!hasValidFrontrunnerDemoSession(req.cookies.get(FRONTRUNNER_DEMO_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "demo_access_required" }, { status: 401 });
  }

  const incoming = await req.formData();

  try {
    const brandSlug = String(incoming.get("brandSlug") || "").trim();
    const productId = String(incoming.get("productId") || "").trim();
    const shopperName = String(incoming.get("shopperName") || "").trim() || undefined;
    const profile = measurementProfileSchema.parse(
      JSON.parse(String(incoming.get("profile") || "{}"))
    );
    const recommendation = fitRecommendationSchema.parse(
      JSON.parse(String(incoming.get("recommendation") || "{}"))
    );

    if (!brandSlug || !productId) {
      return NextResponse.json({ error: "missing_brand_or_product" }, { status: 400 });
    }

    const userImages = incoming
      .getAll("userImages")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (userImages.length === 0 || userImages.length > 3) {
      return NextResponse.json(
        { error: "user_images_required", message: "Upload between 1 and 3 body photos." },
        { status: 400 }
      );
    }

    const product = await getPitchProduct(brandSlug, productId);
    if (!product) {
      return NextResponse.json({ error: "product_not_found" }, { status: 404 });
    }

    const imageUrl = product.images[0];
    const absoluteImageUrl = toAbsoluteAssetUrl(req.nextUrl.origin, imageUrl);
    const parsedImageUrl = new URL(absoluteImageUrl);
    if (
      parsedImageUrl.protocol !== "https:" &&
      parsedImageUrl.origin !== req.nextUrl.origin
    ) {
      return NextResponse.json(
        { error: "unsafe_catalog_image_url", message: "Only same-origin or HTTPS catalog images are allowed." },
        { status: 400 }
      );
    }
    if (
      parsedImageUrl.origin !== req.nextUrl.origin &&
      isPrivateHostname(parsedImageUrl.hostname)
    ) {
      return NextResponse.json(
        { error: "unsafe_catalog_image_url", message: "Private-network catalog image URLs are not allowed." },
        { status: 400 }
      );
    }
    const clothingImageResponse = await fetch(absoluteImageUrl, { cache: "no-store" });

    if (!clothingImageResponse.ok) {
      return NextResponse.json(
        { error: "catalog_image_unavailable", message: "The selected garment image could not be loaded." },
        { status: 502 }
      );
    }

    const clothingImageType = clothingImageResponse.headers.get("content-type") || "image/jpeg";
    const clothingImageBuffer = await clothingImageResponse.arrayBuffer();

    const backend = resolveBackendApiUrl(process.env.NEXT_PUBLIC_API_URL || undefined);
    if (!backend.apiUrl) {
      return NextResponse.json(
        { error: "backend_unavailable", message: backend.reason || "NEXT_PUBLIC_API_URL is missing." },
        { status: 500 }
      );
    }

    const backendFormData = new FormData();
    for (const userImage of userImages) {
      backendFormData.append("user_images", userImage);
    }
    backendFormData.append(
      "clothing_image",
      new File([clothingImageBuffer], `${product.id}-catalog.jpg`, { type: clothingImageType })
    );
    backendFormData.append("category", categoryForProduct(product.category));
    backendFormData.append(
      "garment_metadata",
      JSON.stringify({
        brand: product.brand,
        title: product.title,
        category: product.category,
        size_system: product.sizeSystem,
        size_type: product.sizeType,
        material: product.material,
        stretch: product.stretch,
        fit_notes: product.variants.find(
          (variant) => variant.externalVariantId === recommendation.recommendedVariantId
        )?.fitNotes,
        recommended_size: recommendation.recommendedSizeLabel,
        recommendation_reasoning: recommendation.reasoning,
      })
    );

    const backendResponse = await fetch(`${backend.apiUrl}/api/try-on`, {
      method: "POST",
      body: backendFormData,
      headers: buildBackendHeaders(),
      cache: "no-store",
    });

    const backendPayload = await backendResponse.json().catch(() => ({}));

    if (!backendResponse.ok) {
      await createPitchSession({
        brandSlug,
        productId,
        productTitle: product.title,
        shopperName,
        profile,
        recommendation,
        resultImageUrl: null,
        status: "failed",
      });
      return NextResponse.json(
        {
          error: "try_on_failed",
          message:
            (backendPayload as { detail?: string; error?: string }).detail ||
            (backendPayload as { error?: string }).error ||
            "The virtual try-on request failed.",
        },
        { status: backendResponse.status }
      );
    }

    const resultImageUrl =
      (backendPayload as { image_url?: string }).image_url || null;

    await createPitchSession({
      brandSlug,
      productId,
      productTitle: product.title,
      shopperName,
      profile,
      recommendation,
      resultImageUrl,
      status: resultImageUrl ? "completed" : "failed",
    });

    return NextResponse.json({
      imageUrl: resultImageUrl,
      recommendation,
      product,
      modestyApplied: Boolean((backendPayload as { modesty_applied?: boolean }).modesty_applied),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "invalid_request",
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Unexpected try-on error";
    return NextResponse.json({ error: "try_on_failed", message }, { status: 500 });
  }
}
