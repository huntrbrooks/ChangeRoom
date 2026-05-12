export const ANALYTICS_EVENTS = {
  PAGE_VIEW: "page_view",
  SIGN_UP: "sign_up",
  SIGN_IN: "sign_in",
  USER_UPDATED: "user_updated",
  USER_DELETED: "user_deleted",
  TRY_ON_ATTEMPT: "tryon_attempt",
  TRY_ON_SUCCESS: "tryon_success",
  SHOP_SELECTION: "shop_selection",
  FREE_TRY_ON_COMPLETED: "free_tryon_completed",
  PAYWALL_VIEW_AFTER_RESULT: "paywall_view_after_result",
  CHECKOUT_STARTED: "checkout_started",
  PURCHASE_COMPLETED: "purchase_completed",
  SUBSCRIPTION_STARTED: "subscription_started",
  SUBSCRIPTION_CHANGED: "subscription_changed",
  SUBSCRIPTION_CANCELLED: "subscription_cancelled",
  SUBSCRIPTION_PAYMENT_FAILED: "subscription_payment_failed",
  SUBSCRIPTION_PAYMENT_SUCCEEDED: "subscription_payment_succeeded",
  CREDIT_GRANTED: "credit_granted",
  CREDIT_DEDUCTED: "credit_deducted",
  ERROR: "error",
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
