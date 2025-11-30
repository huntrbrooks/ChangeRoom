import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import { openaiConfig } from "@/lib/config";
import { insertClothingItems } from "@/lib/db-access";

const openai = new OpenAI({
  apiKey: openaiConfig.apiKey,
});

export async function POST(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { items } = body as {
      items: {
        storageKey: string;
        publicUrl: string;
        mimeType: string;
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
  - description: one concise sentence.
  - tags: 3 to 10 useful tags for search.
  - recommended_filename: short, kebab case, describing the item, with a .jpg extension, for example "black-oversized-graphic-tee-streetwear.jpg".

Return JSON only, matching the schema, one item per input image, with index matching the order the images were provided, starting at 0.
        `.trim(),
      },
    ];

    for (const it of items) {
      contentParts.push({
        type: "image_url",
        image_url: {
          url: it.publicUrl,
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
        description: string;
        tags?: string[];
        recommended_filename: string;
      }[];
    };

    // Validate storage keys belong to this user
    for (const item of items) {
      if (!item.storageKey.startsWith(`clothing/user_${userId}/`)) {
        return NextResponse.json(
          { error: "Invalid storage key for this user" },
          { status: 403 }
        );
      }
    }

    // Prepare items for insertion
    const itemsToInsert = parsed.items
      .map((meta) => {
        const src = items[meta.index];
        if (!src) return null;

        return {
          storageKey: src.storageKey,
          publicUrl: src.publicUrl,
          category: meta.category,
          subcategory: meta.subcategory || null,
          color: meta.color || null,
          style: meta.style || null,
          description: meta.description,
          tags: meta.tags || [],
          originalFilename: src.originalFilename || null,
          mimeType: src.mimeType || null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const saved = await insertClothingItems(userId, itemsToInsert);

    return NextResponse.json({ items: saved });
  } catch (err: unknown) {
    console.error("preprocess-clothing error:", err);
    // Don't expose internal error details in production
    return NextResponse.json(
      {
        error: "Failed to preprocess clothing images",
      },
      { status: 500 }
    );
  }
}

