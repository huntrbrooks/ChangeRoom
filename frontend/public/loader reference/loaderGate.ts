export type LoaderGateInput = {
  latestResponseAt?: string | null
  completionSeenAt?: string | null
}

const parseTimestamp = (value?: string | null): number | null => {
  if (!value) return null
  const ts = Date.parse(value)
  return Number.isNaN(ts) ? null : ts
}

/**
 * Returns true when the diagnostic analysis loader should start.
 * We only restart if a new response landed after the last time the
 * completion prompt was acknowledged.
 */
export const shouldStartDiagnosticLoader = ({ latestResponseAt, completionSeenAt }: LoaderGateInput): boolean => {
  const latestTs = parseTimestamp(latestResponseAt)
  if (latestTs == null) return false

  const completionTs = parseTimestamp(completionSeenAt)
  if (completionTs == null) return true

  return latestTs > completionTs
}

