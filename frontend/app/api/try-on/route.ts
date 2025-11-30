import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { r2, getPublicUrl } from "@/lib/r2";
import { r2Config, geminiConfig } from "@/lib/config";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  getPersonImageById,
  getClothingItemsByIds,
  decrementCreditsIfAvailable,
  getOrCreateUserBilling,
  insertTryOnSession,
  updateTryOnSessionResult,
} from "@/lib/db-access";
import { randomUUID } from "crypto";

/**
 * Fetch image from R2 and convert to base64
 */
async function getR2ObjectBase64(
  key: string
): Promise<{ base64: string; mimeType: string }> {
  const command = new GetObjectCommand({
    Bucket: r2Config.bucketName,
    Key: key,
  });
  const res = await r2.send(command);

  const chunks: Uint8Array[] = [];
  // @ts-ignore - Body is a stream
  for await (const chunk of res.Body) {
    chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);
  const base64 = buffer.toString("base64");
  const mimeType = res.ContentType || "image/jpeg";

  return { base64, mimeType };
}

/**
 * Upload image to R2
 */
async function uploadToR2(
  key: string,
  imageBuffer: Buffer,
  contentType: string
): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: r2Config.bucketName,
    Key: key,
    Body: imageBuffer,
    ContentType: contentType,
  });

  await r2.send(command);
}

/**
 * Call Gemini API using REST (not SDK) for try-on generation
 */
async function generateTryOnWithGemini(
  personImageBase64: string,
  personMimeType: string,
  clothingImages: Array<{ base64: string; mimeType: string }>
): Promise<{ base64: string; mimeType: string }> {
  const parts: any[] = [
    {
      inlineData: {
        data: personImageBase64,
        mimeType: personMimeType,
      },
    },
  ];

  // Add clothing images
  for (const clothing of clothingImages) {
    parts.push({
      inlineData: {
        data: clothing.base64,
        mimeType: clothing.mimeType,
      },
    });
  }

  // Add instruction text
  parts.push({
    text: `
First image is the person. Following images are clothing items. Generate one photorealistic image of the same person wearing all the clothing items. Keep pose and identity consistent. Do not add extra logos or text beyond what is visible on the clothing.
    `.trim(),
  });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${geminiConfig.apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts,
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const imagePart = data.candidates?.[0]?.content?.parts?.find(
    (p: any) => p.inlineData
  );

  if (!imagePart) {
    throw new Error("No image returned from Gemini");
  }

  return {
    base64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}

/**
 * POST /api/try-on
 * Generates a try-on image using Gemini
 * Requires: personImageId, clothingItemIds (1-5 items)
 * Checks and decrements credits before processing
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let sessionId: string | null = null;

  try {
    const body = await req.json();
    const { personImageId, clothingItemIds } = body as {
      personImageId: string;
      clothingItemIds: string[];
    };

    if (!personImageId || !clothingItemIds?.length) {
      return NextResponse.json(
        { error: "Missing personImageId or clothingItemIds" },
        { status: 400 }
      );
    }

    if (clothingItemIds.length > 5) {
      return NextResponse.json(
        { error: "Maximum 5 clothing items allowed" },
        { status: 400 }
      );
    }

    // Payment bypass for specific email
    const BYPASS_EMAILS = ["gerard.grenville@gmail.com"];
    const user = await currentUser();
    const userEmail = user?.emailAddresses?.[0]?.emailAddress?.toLowerCase();
    const shouldBypassPayment = userEmail && BYPASS_EMAILS.includes(userEmail.toLowerCase());
    
    // Check credits before processing (unless bypassed)
    if (!shouldBypassPayment) {
      const hasCredits = await decrementCreditsIfAvailable(userId);
      if (!hasCredits) {
        const billing = await getOrCreateUserBilling(userId);
        return NextResponse.json(
          {
            error: "no_credits",
            creditsAvailable: billing.credits_available,
          },
          { status: 402 }
        );
      }
    } else {
      console.log(`Payment bypassed for user: ${userEmail}`);
    }

    // Fetch person image (scoped to user)
    const person = await getPersonImageById(userId, personImageId);
    if (!person) {
      // Refund credit since we couldn't process
      await getOrCreateUserBilling(userId);
      // Note: We can't easily refund here without a transaction, but this is an edge case
      return NextResponse.json(
        { error: "Person image not found" },
        { status: 404 }
      );
    }

    // Fetch clothing items (scoped to user, max 5)
    const clothing = await getClothingItemsByIds(userId, clothingItemIds);
    if (clothing.length === 0) {
      return NextResponse.json(
        { error: "No clothing items found" },
        { status: 404 }
      );
    }

    // Create try-on session record
    const session = await insertTryOnSession(userId, {
      personImageId,
      clothingItemIds,
      status: "pending",
    });
    sessionId = session.id;

    // Fetch images from R2 and convert to base64
    const personData = await getR2ObjectBase64(person.storage_key);
    const clothingData = await Promise.all(
      clothing.map((c) => getR2ObjectBase64(c.storage_key))
    );

    // Generate try-on image using Gemini REST API
    const result = await generateTryOnWithGemini(
      personData.base64,
      personData.mimeType,
      clothingData.map((d) => ({
        base64: d.base64,
        mimeType: d.mimeType,
      }))
    );

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(result.base64, "base64");

    // Save result to R2
    const resultKey = `tryon/user_${userId}/${randomUUID()}.png`;
    await uploadToR2(resultKey, imageBuffer, result.mimeType);
    const resultPublicUrl = getPublicUrl(resultKey);

    // Update session with result
    await updateTryOnSessionResult(sessionId, userId, {
      resultStorageKey: resultKey,
      resultPublicUrl,
      status: "completed",
    });

    return NextResponse.json({
      imageBase64: result.base64,
      mimeType: result.mimeType,
      publicUrl: resultPublicUrl,
    });
  } catch (err: any) {
    console.error("try-on error:", err);

    // Mark session as failed if it was created
    if (sessionId && userId) {
      try {
        await updateTryOnSessionResult(sessionId, userId, {
          status: "failed",
          error: err.message,
        });
      } catch (updateErr) {
        console.error("Failed to update session error:", updateErr);
      }
    }

    return NextResponse.json(
      {
        error: "Try on failed",
        details: err.message,
      },
      { status: 500 }
    );
  }
}
