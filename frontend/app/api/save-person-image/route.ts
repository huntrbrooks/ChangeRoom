import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { insertPersonImage } from "@/lib/db-access";

export async function POST(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      storageKey,
      publicUrl,
      mimeType,
      originalFilename,
      description,
      width,
      height,
    } = body as {
      storageKey: string;
      publicUrl: string;
      mimeType: string;
      originalFilename?: string;
      description?: string;
      width?: number;
      height?: number;
    };

    if (!storageKey || !publicUrl || !mimeType) {
      return NextResponse.json(
        { error: "Missing required fields: storageKey, publicUrl, mimeType" },
        { status: 400 }
      );
    }

    // Validate storage key belongs to this user
    if (!storageKey.startsWith(`person/user_${userId}/`)) {
      return NextResponse.json(
        { error: "Invalid storage key for this user" },
        { status: 403 }
      );
    }

    const personImage = await insertPersonImage(userId, {
      storageKey,
      publicUrl,
      mimeType,
      originalFilename,
      description,
      width,
      height,
    });

    return NextResponse.json({ personImage });
  } catch (err: any) {
    console.error("save-person-image error:", err);
    // Don't expose internal error details in production
    return NextResponse.json(
      {
        error: "Failed to save person image",
      },
      { status: 500 }
    );
  }
}

