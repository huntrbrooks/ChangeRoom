import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import { openaiConfig } from "@/lib/config";
import { insertClothingItems } from "@/lib/db-access";
import { checkRateLimit } from "@/lib/rate-limit";
import { r2, getPublicUrl } from "@/lib/r2";
import { r2Config } from "@/lib/config";
import { GetObjectCommand } from "@aws-sdk/client-s3";

const openai = new OpenAI({
  apiKey: openaiConfig.apiKey,
});

async function getR2ObjectDataUrl(key: string): Promise<{ dataUrl: string; mimeType: string }> {
  const command = new GetObjectCommand({
    Bucket: r2Config.bucketName,
    Key: key,
  });
  const res = await r2.send(command);

  const chunks: Uint8Array[] = [];
  // @ts-expect-error Body is a stream; type defs don't always include async iterator
  for await (const chunk of res.Body) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  const mimeType = res.ContentType || "image/jpeg";
  const base64 = buffer.toString("base64");
  return { dataUrl: `data:${mimeType};base64,${base64}`, mimeType };
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    res.headers.set("X-ChangeRoom-Stack", "nextjs-vercel");
    const rid = req.headers.get("x-request-id") || req.headers.get("x-changeroom-request-id");
    if (rid) {
      res.headers.set("X-Request-Id", rid);
      res.headers.set("X-ChangeRoom-Request-Id", rid);
    }
    return res;
  }

  try {
    const rid = req.headers.get("x-request-id") || req.headers.get("x-changeroom-request-id");
    // Best-effort per-instance rate limiting
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rlUser = checkRateLimit(`preprocess:user:${userId}`, 10, 60_000);
    const rlIp = checkRateLimit(`preprocess:ip:${ip}`, 30, 60_000);
    if (!rlUser.allowed || !rlIp.allowed) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterMs: 60_000 },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { items } = body as {
      items: {
        storageKey: string;
        publicUrl?: string;
        mimeType?: string;
        originalFilename?: string;
      }[];
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "No items supplied" },
        { status: 400 }
      );
    }

    if (items.length > 5) {
      return NextResponse.json(
        { error: "Maximum 5 items allowed" },
        { status: 400 }
      );
    }

    // Validate storage keys belong to this user
    for (const item of items) {
      if (
        typeof item?.storageKey !== "string" ||
        !item.storageKey.startsWith(`clothing/user_${userId}/`)
      ) {
        return NextResponse.json(
          { error: "Invalid storage key for this user" },
          { status: 403 }
        );
      }
    }

    const contentParts: ChatCompletionContentPart[] = [
      {
        type: "text",
        text: `
You are an image tagging and naming assistant for a virtual try on app.

You will receive several clothing item photos as image URLs.

For each image:
- Analyze it individually.
- Determine:
  - category: high level type such as tshirt, hoodie, jacket, pants, shorts, shoes, accessory, dress, coat, sweater, etc.
  - subcategory: more specific style if possible.
  - color: simple human color name, like "black", "off white", "navy blue".
  - style: optional high level style like "streetwear", "formal", "casual", "sport".
  - brand: brand name if a logo/label is visible; otherwise "unknown" or "unbranded".
  - description: one concise sentence.
  - tags: 3 to 10 useful tags for search.
  - recommended_filename: short, kebab case, describing the item, with a .jpg extension, for example "black-oversized-graphic-tee-streetwear.jpg".

Return JSON only, matching the schema, one item per input image, with index matching the order the images were provided, starting at 0.
        `.trim(),
      },
    ];

    // Fetch the images from R2 using storageKey; do NOT trust client-provided URLs to avoid SSRF.
    for (const it of items) {
      const { dataUrl } = await getR2ObjectDataUrl(it.storageKey);
      contentParts.push({
        type: "image_url",
        image_url: {
          url: dataUrl,
        },
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Using gpt-4o-mini (actual model name, not gpt-4.1-mini)
      messages: [
        {
          role: "user",
          content: contentParts,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "clothing_items",
          schema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    index: { type: "integer" },
                    category: { type: "string" },
                    subcategory: { type: "string" },
                    color: { type: "string" },
                    style: { type: "string" },
                    brand: { type: "string" },
                    description: { type: "string" },
                    tags: {
                      type: "array",
                      items: { type: "string" },
                    },
                    recommended_filename: { type: "string" },
                  },
                  required: [
                    "index",
                    "category",
                    "color",
                    "description",
                    "recommended_filename",
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ["items"],
            additionalProperties: false,
          },
          strict: true,
        },
      },
    });

    const jsonText = response.choices[0]?.message?.content;
    if (!jsonText) {
      throw new Error("No response from OpenAI");
    }

    const parsed = JSON.parse(jsonText) as {
      items: {
        index: number;
        category: string;
        subcategory?: string;
        color: string;
        style?: string;
        brand?: string;
        description: string;
        tags?: string[];
        recommended_filename: string;
      }[];
    };

    // Prepare items for insertion
    const itemsToInsert = parsed.items
      .map((meta) => {
        const src = items[meta.index];
        if (!src) return null;

        return {
          storageKey: src.storageKey,
          publicUrl: getPublicUrl(src.storageKey),
          category: meta.category,
          subcategory: meta.subcategory || null,
          color: meta.color || null,
          style: meta.style || null,
          brand: meta.brand || null,
          description: meta.description,
          tags: meta.tags || [],
          originalFilename: src.originalFilename || null,
          mimeType: src.mimeType || null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const saved = await insertClothingItems(userId, itemsToInsert);

    const res = NextResponse.json({ items: saved });
    res.headers.set("X-ChangeRoom-Stack", "nextjs-vercel");
    if (rid) {
      res.headers.set("X-Request-Id", rid);
      res.headers.set("X-ChangeRoom-Request-Id", rid);
    }
    return res;
  } catch (err: unknown) {
    console.error("preprocess-clothing error:", err);
    // Don't expose internal error details in production
    const res = NextResponse.json(
      {
        error: "Failed to preprocess clothing images",
      },
      { status: 500 }
    );
    res.headers.set("X-ChangeRoom-Stack", "nextjs-vercel");
    const rid = req.headers.get("x-request-id") || req.headers.get("x-changeroom-request-id");
    if (rid) {
      res.headers.set("X-Request-Id", rid);
      res.headers.set("X-ChangeRoom-Request-Id", rid);
    }
    return res;
  }
}

