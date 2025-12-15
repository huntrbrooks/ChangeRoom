'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'

type TryOnProgressLoaderProps = {
  /** Whether generation is currently running */
  isActive: boolean
  /** Status of the generation lifecycle */
  status: 'pending' | 'success' | 'error'
  /** Optional failure message to surface on error */
  failureMessage?: string
  /** Called after the fade-out finishes */
  onFinished?: () => void
  /** Stage change callback (1-5) */
  onStageChange?: (stageId: number) => void
}

type Stage = {
  id: number
  label: string
  description: string
  icon: string
  targetPercent: number
}

const STAGES: Stage[] = [
  {
    id: 1,
    label: 'Analyzing images',
    description: 'Reading your photos and garments',
    icon: '/loader/stage-01.png',
    targetPercent: 8,
  },
  {
    id: 2,
    label: 'Constructing outfit',
    description: 'Pairing pieces for the best look',
    icon: '/loader/stage-02.png',
    targetPercent: 28,
  },
  {
    id: 3,
    label: 'Dressing model',
    description: 'Applying garments on your model',
    icon: '/loader/stage-03.png',
    targetPercent: 58,
  },
  {
    id: 4,
    label: 'Final details',
    description: 'Polishing lighting and fit',
    icon: '/loader/stage-04.png',
    targetPercent: 82,
  },
  {
    id: 5,
    label: 'Complete',
    description: 'Your look is ready',
    icon: '/loader/stage-05.png',
    targetPercent: 100,
  },
]

const MIN_STAGE_MS = 5000
const EXIT_FADE_MS = 2400
const FAILSAFE_EXIT_MS = 30000

export function TryOnProgressLoader({ isActive, status, failureMessage, onFinished, onStageChange }: TryOnProgressLoaderProps) {
  const [progress, setProgress] = useState(0)
  const [stageIndex, setStageIndex] = useState(0)
  const [isExiting, setIsExiting] = useState(false)
  const progressRef = useRef(0)
  const statusRef = useRef(status)
  const stageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stage4GateRef = useRef(false)
  const failsafeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track latest status for timers without retriggering effects
  useEffect(() => {
    statusRef.current = status
  }, [status])

  // Centralized exit handling to guarantee fade-out and completion
  const startExit = React.useCallback(() => {
    if (isExiting) return
    if (stageTimerRef.current) {
      clearTimeout(stageTimerRef.current)
      stageTimerRef.current = null
    }
    if (failsafeTimerRef.current) {
      clearTimeout(failsafeTimerRef.current)
      failsafeTimerRef.current = null
    }

    setStageIndex(STAGES.length - 1)
    progressRef.current = 100
    setProgress(100)
    setIsExiting(true)

    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current)
    }
    fadeTimerRef.current = setTimeout(() => {
      onFinished?.()
      setIsExiting(false)
    }, EXIT_FADE_MS)
  }, [isExiting, onFinished])

  // Reset when (re)activated
  useEffect(() => {
    if (isActive) {
      setProgress(0)
      progressRef.current = 0
      setStageIndex(0)
      setIsExiting(false)
      stage4GateRef.current = false
      if (failsafeTimerRef.current) {
        clearTimeout(failsafeTimerRef.current)
        failsafeTimerRef.current = null
      }

      if (stageTimerRef.current) {
        clearTimeout(stageTimerRef.current)
        stageTimerRef.current = null
      }
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current)
        fadeTimerRef.current = null
      }
      if (failsafeTimerRef.current) {
        clearTimeout(failsafeTimerRef.current)
        failsafeTimerRef.current = null
      }
    }
  }, [isActive])

  // Drive staged progression with gentle easing
  useEffect(() => {
    if (!isActive || isExiting) return

    let raf: number
    let last = performance.now()

    const tick = (now: number) => {
      const delta = now - last
      last = now

      const target = STAGES[Math.min(stageIndex, STAGES.length - 1)].targetPercent
      const allowedTarget = target

      // ease toward target over ~5s
      const current = progressRef.current
      const remaining = allowedTarget - current
      if (remaining > 0) {
        const seconds = delta / 1000
        const rate = remaining / 5
        const increment = rate * seconds
        const next = Math.min(current + increment, allowedTarget)
        if (!Number.isNaN(next) && next !== current) {
          progressRef.current = next
          setProgress(next)
        }
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isActive, isExiting, stageIndex])

  // Advance stages with fixed timing: stages 1-3 always 5s, stage 4 waits for min 5s then image ready
  useEffect(() => {
    if (!isActive || isExiting) return

    if (stageTimerRef.current) {
      clearTimeout(stageTimerRef.current)
      stageTimerRef.current = null
    }

    // Stages 1-3 (indices 0-2): advance every 5s regardless of image readiness
    if (stageIndex <= 2) {
      stageTimerRef.current = setTimeout(() => {
        setStageIndex((prev) => Math.min(prev + 1, STAGES.length - 2)) // move toward stage 4
      }, MIN_STAGE_MS)
      return () => {
        if (stageTimerRef.current) {
          clearTimeout(stageTimerRef.current)
          stageTimerRef.current = null
        }
      }
    }

    // Stage 4: enforce 5s minimum, then wait for resolution (success or error) before stage 5
    if (stageIndex === 3) {
      stage4GateRef.current = false
      stageTimerRef.current = setTimeout(() => {
        stage4GateRef.current = true
        if (statusRef.current !== 'pending') {
          setStageIndex(STAGES.length - 1)
        }
      }, MIN_STAGE_MS)
    }

    return () => {
      if (stageTimerRef.current) {
        clearTimeout(stageTimerRef.current)
        stageTimerRef.current = null
      }
    }
  }, [isActive, isExiting, stageIndex])

  // If generation resolves after stage 4 min time, advance to stage 5
  useEffect(() => {
    if (!isActive || isExiting) return
    if (stageIndex === 3 && stage4GateRef.current && status !== 'pending') {
      setStageIndex(STAGES.length - 1)
    }
  }, [isActive, isExiting, status, stageIndex])

  // If generation resolves early (success or error), jump to stage 5 and start exit to avoid getting stuck
  useEffect(() => {
    if (!isActive || isExiting) return
    if (status !== 'pending' && stageIndex < STAGES.length - 1) {
      setStageIndex(STAGES.length - 1)
      startExit()
    }
  }, [status, isActive, isExiting, stageIndex, startExit])

  // Enter stage 5, snap to 100%, then fade out over EXIT_FADE_MS before invoking onFinished
  useEffect(() => {
    if (!isActive) return
    if (stageIndex !== STAGES.length - 1) return

    startExit()

    return () => {
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current)
        fadeTimerRef.current = null
      }
    }
  }, [stageIndex, isActive, onFinished, startExit])

  // Failsafe: if loader stays active too long, force completion
  useEffect(() => {
    if (!isActive || isExiting) return
    if (failsafeTimerRef.current) {
      clearTimeout(failsafeTimerRef.current)
    }
    failsafeTimerRef.current = setTimeout(() => {
      startExit()
    }, FAILSAFE_EXIT_MS)

    return () => {
      if (failsafeTimerRef.current) {
        clearTimeout(failsafeTimerRef.current)
        failsafeTimerRef.current = null
      }
    }
  }, [isActive, isExiting, startExit])

  // Cleanup timers if loader deactivates
  useEffect(() => {
    if (isActive) return
    if (stageTimerRef.current) {
      clearTimeout(stageTimerRef.current)
      stageTimerRef.current = null
    }
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current)
      fadeTimerRef.current = null
    }
  }, [isActive])

  const stage = useMemo(() => STAGES[Math.min(stageIndex, STAGES.length - 1)], [stageIndex])
  const percentInt = Math.round(progress)
  const isError = status === 'error'
  const displayLabel = isError ? 'Generation failed' : stage.label
  const displayDescription = isError
    ? failureMessage || 'We could not generate this look. Please try again.'
    : stage.description

  useEffect(() => {
    onStageChange?.(stage.id)
  }, [onStageChange, stage.id])

  return (
    <div
      className={`
        absolute inset-0 z-10 flex flex-col items-center justify-center 
        bg-white/92 backdrop-blur-sm
        ${isExiting ? 'opacity-0' : 'opacity-100'}
      `}
      style={{
        transitionProperty: 'opacity, transform',
        transitionDuration: `${EXIT_FADE_MS}ms`,
        transitionTimingFunction: 'ease-in-out',
        transform: isExiting ? 'translateY(10px) scale(0.985)' : 'translateY(0) scale(1)',
        pointerEvents: isExiting ? 'none' : 'auto',
      }}
      aria-live="polite"
      aria-busy={isActive && !isExiting}
      aria-label={`Processing stage ${stage.id} of 5: ${stage.label}`}
      role="status"
    >
      <div className="flex flex-col items-center gap-4 px-6 text-center max-w-xs">
        <div className="relative">
          <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 border-black/10 flex items-center justify-center relative">
            <div
              className="absolute inset-1 rounded-full border-4 border-orange-500/80 border-t-transparent animate-spin"
              style={{ animationDuration: '2200ms' }}
            />
            <div className="absolute inset-1 rounded-full border-4 border-transparent border-t-black/80 animate-spin" style={{ animationDuration: '1400ms' }} />
            <Image
              src={stage.icon}
              alt={stage.label}
              width={56}
              height={56}
              className="w-12 h-12 sm:w-14 sm:h-14 object-contain relative z-10"
              priority
            />
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-sm sm:text-base font-bold uppercase tracking-wide text-black">{displayLabel}</p>
          <p className={`text-xs sm:text-sm ${isError ? 'text-red-600' : 'text-black/70'}`}>{displayDescription}</p>
        </div>

        <div className="w-full">
          <div className="w-full h-2 bg-black/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-black rounded-full transition-[width] duration-500 ease-out shadow-[0_0_10px_rgba(0,0,0,0.25)]"
              style={{ width: `${percentInt}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] sm:text-xs text-black/60 mt-1">
            <span>Stage {stage.id}/5</span>
            <span>{percentInt}%</span>
          </div>
        </div>

        <div className="flex gap-2 mt-1">
          {STAGES.map((s, idx) => (
            <span
              key={s.id}
              className={`
                w-2 h-2 rounded-full transition-all
                ${idx <= stageIndex ? 'bg-black' : 'bg-black/20'}
              `}
            />
          ))}
        </div>
      </div>
    </div>
  )
}



