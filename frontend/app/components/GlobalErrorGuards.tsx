'use client';

import { useEffect } from "react";
import { recordClientDiagnostic } from "@/lib/clientDiagnostics";

function isLikelyExtensionMessageChannelError(reason: unknown): boolean {
  const msg =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : "";
  return (
    msg.includes(
      "A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received"
    ) || msg.includes("message channel closed")
  );
}

/**
 * Global error guards:
 * - Prevent noisy (and misleading) console noise from browser extensions that inject
 *   async message listeners and then fail to respond.
 * - Avoid uncaught promise rejection noise for known-extension errors while still
 *   logging real app failures.
 */
export function GlobalErrorGuards() {
  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isLikelyExtensionMessageChannelError(event.reason)) {
        // These are almost always caused by extensions (password managers, ad blockers, etc).
        // Prevents "Uncaught (in promise)" spam that looks like our app failed.
        event.preventDefault();
        return;
      }
      recordClientDiagnostic(
        "global_unhandled_rejection",
        { reason: event.reason },
        "warn"
      );
      console.warn("[global] unhandledrejection", event.reason);
    };

    const onError = (event: ErrorEvent) => {
      recordClientDiagnostic(
        "global_error",
        {
          message: event.message,
          source: event.filename,
          line: event.lineno,
          column: event.colno,
          error: event.error,
        },
        "error"
      );
    };

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return null;
}

