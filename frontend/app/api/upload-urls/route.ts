import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generateSignedPutUrl, getPublicUrl } from "@/lib/r2";
import { randomUUID } from "crypto";

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

