import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { generateSignedPutUrl, getPublicUrl } from "@/lib/r2";
import { randomUUID } from "crypto";
import { countClothingItemsByUser } from "@/lib/db-access";

export async function POST(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { files, kind } = body as {
    kind: "clothing" | "person";
    files: { mimeType: string; extension?: string }[];
  };

  if (!files || !Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: "No files" }, { status: 400 });
  }

  if (!kind || (kind !== "clothing" && kind !== "person")) {
    return NextResponse.json(
      { error: "kind must be 'clothing' or 'person'" },
      { status: 400 }
    );
  }

  // Cap uploads per day for new accounts
  const user = await currentUser();
  const createdAt = user?.createdAt ? new Date(user.createdAt) : null;
  const isNewUser =
    createdAt !== null &&
    Date.now() - createdAt.getTime() < 3 * 24 * 60 * 60 * 1000;
  if (isNewUser && kind === "clothing") {
    const todayCount = await countClothingItemsByUser(
      userId,
      new Date(Date.now() - 24 * 60 * 60 * 1000)
    );
    const proposed = files.length;
    const dailyLimit = 20;
    if (todayCount + proposed > dailyLimit) {
      return NextResponse.json(
        {
          error: "upload_limit",
          message: "Upload limit reached for today. Please try again tomorrow.",
        },
        { status: 429 }
      );
    }
  }

  const uploads = [];

  for (const f of files) {
    const ext =
      f.extension ||
      (f.mimeType === "image/png" ? "png" : "jpg");

    const id = randomUUID();
    const key = `${kind}/user_${userId}/${id}.${ext}`;

    const uploadUrl = await generateSignedPutUrl(key, f.mimeType, 600); // 10 minutes
    const publicUrl = getPublicUrl(key);

    uploads.push({
      key,
      uploadUrl,
      publicUrl,
      mimeType: f.mimeType,
    });
  }

  return NextResponse.json({ uploads });
}

