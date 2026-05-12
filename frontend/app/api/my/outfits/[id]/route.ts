import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getUserPrimaryEmail } from "@/lib/bypass-config";

/**
 * DELETE /api/my/outfits/[id]
 * Delete a user's outfit
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const {
      deleteUserOutfit,
      getEffectiveUserBilling,
      hasPaidCreditGrant,
      upsertUserProfileFromClerk,
    } = await import(
      "@/lib/db-access"
    );
    // Handle both sync and async params (Next.js 15+ uses Promise)
    const resolvedParams = params instanceof Promise ? await params : params;
    const outfitId = resolvedParams.id;

    if (!outfitId) {
      return NextResponse.json(
        { error: "Missing outfit ID" },
        { status: 400 }
      );
    }

    let userEmail: string | null = null;
    try {
      const user = await currentUser();
      userEmail = getUserPrimaryEmail(user);
      if (user) {
        await upsertUserProfileFromClerk({
          userId,
          email: userEmail,
          firstName: user.firstName || null,
          lastName: user.lastName || null,
          imageUrl: user.imageUrl || null,
          clerkCreatedAt: user.createdAt || null,
        });
      }
    } catch (profileErr) {
      console.warn("delete outfit: failed to sync Clerk user profile", profileErr);
    }

    const { billing, isPrivileged } = await getEffectiveUserBilling(userId, userEmail);
    const hasCredits = (billing.credits_available ?? 0) > 0;
    const hasPurchase =
      isPrivileged || billing.plan !== "free" || (await hasPaidCreditGrant(userId));
    const usedFreeTrial = (billing.trials_remaining ?? 2) === 0;

    if (usedFreeTrial && !hasCredits && !hasPurchase) {
      return NextResponse.json(
        { error: "upgrade_required" },
        { status: 402 }
      );
    }

    const deleted = await deleteUserOutfit(userId, outfitId);

    if (!deleted) {
      return NextResponse.json(
        { error: "Outfit not found or unauthorized" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error("Error deleting outfit:", err);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
