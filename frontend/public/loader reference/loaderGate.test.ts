import { shouldStartDiagnosticLoader } from '@/lib/diagnostic/loaderGate'

describe('shouldStartDiagnosticLoader', () => {
  it('returns false when there is no latest response timestamp', () => {
    expect(shouldStartDiagnosticLoader({ latestResponseAt: null, completionSeenAt: null })).toBe(false)
  })

  it('returns true when no completion has been recorded yet', () => {
    expect(
      shouldStartDiagnosticLoader({
        latestResponseAt: '2024-02-01T12:00:00.000Z',
        completionSeenAt: null,
      })
    ).toBe(true)
  })

  it('returns false when the latest response predates the completion acknowledgment', () => {
    expect(
      shouldStartDiagnosticLoader({
        latestResponseAt: '2024-02-01T12:00:00.000Z',
        completionSeenAt: '2024-02-01T13:00:00.000Z',
      })
    ).toBe(false)
  })

  it('returns true when a new response arrives after completion was acknowledged', () => {
    expect(
      shouldStartDiagnosticLoader({
        latestResponseAt: '2024-02-01T14:00:00.000Z',
        completionSeenAt: '2024-02-01T13:00:00.000Z',
      })
    ).toBe(true)
  })
})

