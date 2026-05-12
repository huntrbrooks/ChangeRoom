'use client';

import { logger } from './logger';

type DiagnosticLevel = 'info' | 'warn' | 'error';

type DiagnosticFields = Record<string, unknown>;

function getDebugSessionId(): string {
  if (typeof window === 'undefined') {
    return 'server';
  }

  const key = 'changeroom_debug_session_id';
  const existing = window.sessionStorage.getItem(key);
  if (existing) {
    return existing;
  }

  const next =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `debug-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.sessionStorage.setItem(key, next);
  return next;
}

function sanitizeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (typeof value === 'string') {
    return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  }

  return value;
}

export function recordClientDiagnostic(
  event: string,
  fields: DiagnosticFields = {},
  level: DiagnosticLevel = 'info'
): void {
  if (typeof window === 'undefined') {
    return;
  }

  const payload = {
    event,
    debug_session_id: getDebugSessionId(),
    path: window.location.pathname,
    route: window.location.href,
    ts: new Date().toISOString(),
    ...Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, sanitizeValue(value)])
    ),
  };

  logger[level](`[jam-debug] ${JSON.stringify(payload)}`);
}
