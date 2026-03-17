export const ANALYTICS_EVENTS = {
  TRY_ON_ATTEMPT: "tryon_attempt",
  TRY_ON_SUCCESS: "tryon_success",
  FREE_TRY_ON_COMPLETED: "free_tryon_completed",
  PAYWALL_VIEW_AFTER_RESULT: "paywall_view_after_result",
  CHECKOUT_STARTED: "checkout_started",
  PURCHASE_COMPLETED: "purchase_completed",
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

