'use client'

import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { TryOnProgressLoader } from '@/app/components/TryOnProgressLoader'

const advance = (ms: number) => act(() => void jest.advanceTimersByTime(ms))

beforeEach(() => {
  jest.useFakeTimers()
  // Provide a basic requestAnimationFrame so the component's RAF loop can run in tests
  global.requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 0) as unknown as number
  global.cancelAnimationFrame = (id: number) => clearTimeout(id as unknown as number)
})

afterEach(() => {
  jest.runOnlyPendingTimers()
  jest.useRealTimers()
})

describe('TryOnProgressLoader timing', () => {
  it('advances stages 1-3 every 5s (fixed timing)', () => {
    render(<TryOnProgressLoader isActive isComplete={false} />)

    expect(screen.getByText(/Stage 1\/5/i)).toBeInTheDocument()

    advance(5_000)
    expect(screen.getByText(/Stage 2\/5/i)).toBeInTheDocument()

    advance(5_000)
    expect(screen.getByText(/Stage 3\/5/i)).toBeInTheDocument()

    advance(5_000) // 3 intervals of 5s -> enter stage 4

    expect(screen.getByText(/Stage 4\/5/i)).toBeInTheDocument()
  })

  it('holds in stage 4 for at least 5s and waits for completion before stage 5', () => {
    const { rerender } = render(<TryOnProgressLoader isActive isComplete={false} />)

    advance(5_000)
    advance(5_000)
    advance(5_000) // reach stage 4
    expect(screen.getByText(/Stage 4\/5/i)).toBeInTheDocument()

    act(() => {
      rerender(<TryOnProgressLoader isActive isComplete />)
    })

    advance(4_000)
    expect(screen.getByText(/Stage 4\/5/i)).toBeInTheDocument()

    advance(1_000)
    expect(screen.getByText(/Stage 5\/5/i)).toBeInTheDocument()
  })

  it('fires onFinished only after the stage 5 fade completes', () => {
    const onFinished = jest.fn()
    render(<TryOnProgressLoader isActive isComplete onFinished={onFinished} />)

    advance(5_000)
    advance(5_000)
    advance(5_000)
    advance(5_000) // reach stage 5 after stage 4 min gate
    expect(screen.getByText(/Stage 5\/5/i)).toBeInTheDocument()
    expect(onFinished).not.toHaveBeenCalled()

    advance(2_399)
    expect(onFinished).not.toHaveBeenCalled()

    advance(1)
    expect(onFinished).toHaveBeenCalledTimes(1)
  })
})

