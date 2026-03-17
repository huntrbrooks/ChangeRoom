import { getBillingBannerState } from '@/lib/billingBanner';

describe('getBillingBannerState', () => {
  it('shows low credits when only a few paid credits remain', () => {
    expect(
      getBillingBannerState({
        isAuthenticated: true,
        billing: { creditsAvailable: 2 },
        isOnTrial: false,
        isGenerating: false,
        isTryOnLoading: false,
        isPreviewResult: false,
        hasGeneratedImage: false,
      })
    ).toBe('low_credits');
  });

  it('suppresses no-credit messaging while a generation is still running', () => {
    expect(
      getBillingBannerState({
        isAuthenticated: true,
        billing: { creditsAvailable: 0 },
        isOnTrial: false,
        isGenerating: true,
        isTryOnLoading: true,
        isPreviewResult: false,
        hasGeneratedImage: false,
      })
    ).toBeNull();
  });

  it('shows a trial-complete message after a successful free preview result', () => {
    expect(
      getBillingBannerState({
        isAuthenticated: true,
        billing: { creditsAvailable: 0 },
        isOnTrial: false,
        isGenerating: false,
        isTryOnLoading: false,
        isPreviewResult: true,
        hasGeneratedImage: true,
      })
    ).toBe('trial_complete');
  });

  it('shows the standard no-credit banner after credits are exhausted without a preview result', () => {
    expect(
      getBillingBannerState({
        isAuthenticated: true,
        billing: { creditsAvailable: 0 },
        isOnTrial: false,
        isGenerating: false,
        isTryOnLoading: false,
        isPreviewResult: false,
        hasGeneratedImage: false,
      })
    ).toBe('no_credits');
  });
});
