type BillingSnapshot = {
  creditsAvailable: number;
};

export type BillingBannerState = 'low_credits' | 'no_credits' | 'trial_complete' | null;

export function getBillingBannerState({
  isAuthenticated,
  billing,
  isOnTrial,
  isGenerating,
  isTryOnLoading,
  isPreviewResult,
  hasGeneratedImage,
}: {
  isAuthenticated: boolean;
  billing: BillingSnapshot | null;
  isOnTrial: boolean;
  isGenerating: boolean;
  isTryOnLoading: boolean;
  isPreviewResult: boolean;
  hasGeneratedImage: boolean;
}): BillingBannerState {
  if (!isAuthenticated || !billing || isOnTrial) {
    return null;
  }

  if (billing.creditsAvailable > 0 && billing.creditsAvailable <= 3) {
    return 'low_credits';
  }

  if (billing.creditsAvailable !== 0) {
    return null;
  }

  if (isPreviewResult && hasGeneratedImage) {
    return 'trial_complete';
  }

  if (isGenerating || isTryOnLoading) {
    return null;
  }

  return 'no_credits';
}
