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
    render(<TryOnProgressLoader isActive status="pending" />)

    expect(screen.getByText(/Stage 1\/5/i)).toBeInTheDocument()

    advance(5_000)
    expect(screen.getByText(/Stage 2\/5/i)).toBeInTheDocument()

    advance(5_000)
    expect(screen.getByText(/Stage 3\/5/i)).toBeInTheDocument()

    advance(5_000) // 3 intervals of 5s -> enter stage 4

    expect(screen.getByText(/Stage 4\/5/i)).toBeInTheDocument()
  })

  it('holds in stage 4 for at least 5s and waits for completion before stage 5', () => {
    const { rerender } = render(<TryOnProgressLoader isActive status="pending" />)

    advance(5_000)
    advance(5_000)
    advance(5_000) // reach stage 4
    expect(screen.getByText(/Stage 4\/5/i)).toBeInTheDocument()

    act(() => {
      rerender(<TryOnProgressLoader isActive status="success" />)
    })

    advance(5_000)
    expect(screen.getByText(/Stage 5\/5/i)).toBeInTheDocument()
  })

  it('fires onFinished only after the stage 5 fade completes', () => {
    const onFinished = jest.fn()
    const { rerender } = render(<TryOnProgressLoader isActive status="pending" onFinished={onFinished} />)

    advance(5_000)
    advance(5_000)
    advance(5_000) // enter stage 4

    act(() => {
      rerender(<TryOnProgressLoader isActive status="success" onFinished={onFinished} />)
    })

    advance(5_000) // reach stage 5 after stage 4 min gate
    expect(screen.getByText(/Stage 5\/5/i)).toBeInTheDocument()

    advance(2_400) // allow fade duration
    expect(onFinished).toHaveBeenCalled()
  })

  it('holds at stage 4 until canComplete becomes true even after success', () => {
    const { rerender } = render(<TryOnProgressLoader isActive status="pending" canComplete={false} />)

    advance(5_000)
    advance(5_000)
    advance(5_000) // reach stage 4
    expect(screen.getByText(/Stage 4\/5/i)).toBeInTheDocument()

    act(() => {
      rerender(<TryOnProgressLoader isActive status="success" canComplete={false} />)
    })

    advance(5_000) // stage 4 min gate elapses but completion gate is closed
    expect(screen.getByText(/Stage 4\/5/i)).toBeInTheDocument()

    act(() => {
      rerender(<TryOnProgressLoader isActive status="success" canComplete />)
    })

    advance(100) // allow effect to promote to stage 5
    expect(screen.getByText(/Stage 5\/5/i)).toBeInTheDocument()
  })
})

