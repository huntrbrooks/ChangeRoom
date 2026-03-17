import { act, renderHook } from '@testing-library/react'
import { useCallback, useRef, useState } from 'react'
import { useAnalysisStageAdvancement } from '../../src/hooks/useAnalysisStageAdvancement'

describe('useAnalysisStageAdvancement', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('advances through all five stages even when progress plateaus', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    const { result } = renderHook(() => {
      const [analysisStep, setAnalysisStep] = useState(1)
      const [progress, setProgress] = useState(0)
      const stageEnteredAtRef = useRef(Date.now())
      const getStepForProgress = useCallback((pct: number) => {
        if (pct < 15) return 1
        if (pct < 35) return 2
        if (pct < 60) return 3
        if (pct < 85) return 4
        return 5
      }, [])

      useAnalysisStageAdvancement({
        showAnalysisLoader: true,
        analysisStep,
        setAnalysisStep,
        visualProgress: progress,
        getStepForProgress,
        minStageMs: [10, 10, 10, 10, 10],
        stageEnteredAtRef,
      })

      return { analysisStep, setProgress }
    })

    act(() => {
      result.current.setProgress(95)
    })

    act(() => {
      jest.advanceTimersByTime(250)
    })
    expect(result.current.analysisStep).toBe(2)

    act(() => {
      jest.advanceTimersByTime(250)
    })
    expect(result.current.analysisStep).toBeGreaterThanOrEqual(3)

    act(() => {
      jest.advanceTimersByTime(250)
    })
    expect(result.current.analysisStep).toBeGreaterThanOrEqual(4)

    act(() => {
      jest.advanceTimersByTime(250)
    })
    expect(result.current.analysisStep).toBe(5)
  })
})


