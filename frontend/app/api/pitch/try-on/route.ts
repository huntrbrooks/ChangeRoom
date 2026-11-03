// Old demo clients may still POST photos. Never read or forward this request.
export function POST() {
  return Response.json(
    {
      error: "pitch_try_on_retired",
      message: "Photo try-ons have moved to the signed-in ChangeRoom studio.",
      studioUrl: "/",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}
