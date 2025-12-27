import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { generateSignedPutUrl, getPublicUrl } from "@/lib/r2";
import { randomUUID } from "crypto";
import { countClothingItemsByUser } from "@/lib/db-access";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const rlUser = checkRateLimit(`upload-urls:user:${userId}`, 60, 60_000);
  const rlIp = checkRateLimit(`upload-urls:ip:${ip}`, 120, 60_000);
  if (!rlUser.allowed || !rlIp.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: 60_000 },
      { status: 429 }
    );
  }

  const body = await req.json();
  const { files, kind } = body as {
    kind: "clothing" | "person";
    files: { mimeType: string; extension?: string }[];
  };

  if (!files || !Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: "No files" }, { status: 400 });
  }
  if (files.length > 10) {
    return NextResponse.json({ error: "Too many files" }, { status: 400 });
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
    const mimeType = typeof f?.mimeType === "string" ? f.mimeType : "";
    // We accept a wider set of inputs but *store* only web-friendly formats.
    // If the client submits a non-optimal format (e.g. HEIC), it should convert first.
    const allowed = new Set([
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      // Allow these only if the client explicitly requests them (not recommended)
      "image/gif",
      "image/bmp",
      "image/tiff",
      "image/heic",
      "image/heif",
      "image/avif",
    ]);
    if (!allowed.has(mimeType)) {
      return NextResponse.json({ error: "Unsupported mimeType" }, { status: 400 });
    }

    const ext =
      f.extension ||
      (mimeType === "image/png"
        ? "png"
        : mimeType === "image/webp"
          ? "webp"
          : mimeType === "image/gif"
            ? "gif"
            : mimeType === "image/bmp"
              ? "bmp"
              : mimeType === "image/tiff"
                ? "tiff"
                : mimeType === "image/heic"
                  ? "heic"
                  : mimeType === "image/heif"
                    ? "heif"
                    : mimeType === "image/avif"
                      ? "avif"
                      : "jpg");

    const id = randomUUID();
    const key = `${kind}/user_${userId}/${id}.${ext}`;

    const uploadUrl = await generateSignedPutUrl(key, mimeType, 600); // 10 minutes
    const publicUrl = getPublicUrl(key);

    uploads.push({
      key,
      uploadUrl,
      publicUrl,
      mimeType,
    });
  }

  return NextResponse.json({ uploads });
}

