import { NextResponse } from "next/server";

/**
 * POST /api/try-on
 *
 * Deprecated: try-on generation now happens via the Render backend (/api/try-on).
 * This route remains to prevent accidental usage and to return a clear error.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "deprecated",
      message:
        "Try-on generation now runs on the Render backend. Use the backend /api/try-on endpoint.",
    },
    { status: 410 }
  );
}
