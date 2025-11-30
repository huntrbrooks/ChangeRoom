/**
 * Tests for configuration module
 */
import { appConfig } from '@/lib/config'

describe('appConfig', () => {
  it('should have valid free credits', () => {
    expect(appConfig.freeCredits).toBeGreaterThanOrEqual(0)
  })

  it('should have valid standard monthly credits', () => {
    expect(appConfig.standardMonthlyCredits).toBeGreaterThan(0)
  })

  it('should have valid pro monthly credits', () => {
    expect(appConfig.proMonthlyCredits).toBeGreaterThan(0)
  })

  it('should have pro credits greater than standard', () => {
    expect(appConfig.proMonthlyCredits).toBeGreaterThan(appConfig.standardMonthlyCredits)
  })

  it('should have valid credit pack amounts', () => {
    expect(appConfig.creditPackSmallAmount).toBeGreaterThan(0)
    expect(appConfig.creditPackLargeAmount).toBeGreaterThan(0)
    expect(appConfig.creditPackLargeAmount).toBeGreaterThan(appConfig.creditPackSmallAmount)
  })
})

