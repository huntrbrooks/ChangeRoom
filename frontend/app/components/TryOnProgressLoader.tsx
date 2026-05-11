'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'

type TryOnProgressLoaderProps = {
  /** Whether generation is currently running */
  isActive: boolean
  /** Status of the generation lifecycle */
  status: 'pending' | 'success' | 'error'
  /** External readiness gate; when false, loader will pause at stage 4 */
  canComplete?: boolean
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
  imageSrc: string
  imageAlt: string
  targetPercent: number
}

const STAGES: Stage[] = [
  {
    id: 1,
    label: 'Analyzing images',
    description: 'Reading your photos and garments',
    imageSrc: '/loader%20reference/icons%20for%20loader-01.png',
    imageAlt: 'Clothing analysis icon',
    targetPercent: 8,
  },
  {
    id: 2,
    label: 'Constructing outfit',
    description: 'Pairing pieces for the best look',
    imageSrc: '/loader%20reference/icons%20for%20loader-02.png',
    imageAlt: 'Outfit construction icon',
    targetPercent: 28,
  },
  {
    id: 3,
    label: 'Dressing model',
    description: 'Applying garments on your model',
    imageSrc: '/loader%20reference/icons%20for%20loader-03.png',
    imageAlt: 'Model dressing icon',
    targetPercent: 58,
  },
  {
    id: 4,
    label: 'Final Details',
    description: 'Polishing lighting and fit',
    imageSrc: '/loader%20reference/icons%20for%20loader-04.png',
    imageAlt: 'Final details icon',
    targetPercent: 82,
  },
  {
    id: 5,
    label: 'Complete',
    description: 'Your look is ready',
    imageSrc: '/loader%20reference/icons%20for%20loader-05.png',
    imageAlt: 'Complete try-on icon',
    targetPercent: 100,
  },
]

const MIN_STAGE_MS = 5000
const EXIT_FADE_MS = 2400
const FAILSAFE_EXIT_MS = 30000
const DEFAULT_CAN_COMPLETE = false

export function TryOnProgressLoader({
  isActive,
  status,
  canComplete = DEFAULT_CAN_COMPLETE,
  failureMessage,
  onFinished,
  onStageChange,
}: TryOnProgressLoaderProps) {
  const [progress, setProgress] = useState(0)
  const [stageIndex, setStageIndex] = useState(0)
  const [isExiting, setIsExiting] = useState(false)
  const progressRef = useRef(0)
  const statusRef = useRef(status)
  const canCompleteRef = useRef(canComplete ?? DEFAULT_CAN_COMPLETE)
  const stageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stage4GateRef = useRef(false)
  const failsafeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track latest status for timers without retriggering effects
  useEffect(() => {
    statusRef.current = status
  }, [status])

  // Keep latest completion gate for timers
  useEffect(() => {
    canCompleteRef.current = canComplete ?? DEFAULT_CAN_COMPLETE
  }, [canComplete])

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

  // Advance stages with fixed timing: stages 1-3 always 5s, stage 4 waits for min 5s then readiness (or error)
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

    // Stage 4: enforce 5s minimum, then wait for completion gate (image ready) or error before stage 5
    if (stageIndex === 3) {
      stage4GateRef.current = false
      stageTimerRef.current = setTimeout(() => {
        stage4GateRef.current = true
        const readyToExit = statusRef.current === 'error' || canCompleteRef.current === true
        if (readyToExit) {
          setStageIndex(STAGES.length - 1)
          startExit()
        }
      }, MIN_STAGE_MS)
    }

    return () => {
      if (stageTimerRef.current) {
        clearTimeout(stageTimerRef.current)
        stageTimerRef.current = null
      }
    }
  }, [isActive, isExiting, stageIndex, startExit])

  // If completion gate opens after stage 4 min time (or error), advance to stage 5
  useEffect(() => {
    if (!isActive || isExiting) return
    if (
      stageIndex === 3 &&
      stage4GateRef.current &&
      (status === 'error' || canCompleteRef.current === true)
    ) {
      setStageIndex(STAGES.length - 1)
      startExit()
    }
  }, [isActive, isExiting, status, stageIndex, canComplete, startExit])

  // Safety: if completion gate opens (or error), force exit even if timers misbehave
  useEffect(() => {
    if (!isActive || isExiting) return
    const ready = status === 'error' || canCompleteRef.current === true
    if (ready) {
      setStageIndex(STAGES.length - 1)
      startExit()
    }
  }, [isActive, isExiting, status, canComplete, startExit])

  // If generation resolves with error early, jump to stage 5 and start exit to avoid getting stuck
  useEffect(() => {
    if (!isActive || isExiting) return
    if (status === 'error' && stageIndex < STAGES.length - 1) {
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

  // Failsafe: if loader stays active too long, keep checking but only exit once ready
  useEffect(() => {
    if (!isActive || isExiting) return
    const scheduleFailsafe = () => {
      if (failsafeTimerRef.current) {
        clearTimeout(failsafeTimerRef.current)
      }
      failsafeTimerRef.current = setTimeout(() => {
        const ready = statusRef.current === 'error' || canCompleteRef.current === true
        if (ready) {
          startExit()
        } else {
          scheduleFailsafe()
        }
      }, FAILSAFE_EXIT_MS)
    }

    scheduleFailsafe()

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
        bg-white/96 backdrop-blur-[2px]
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
      <div className="flex w-full max-w-[34rem] flex-col items-center px-3 text-center sm:px-6">
        <div className="grid w-full grid-cols-6 items-start gap-x-1 gap-y-4 sm:gap-x-3 sm:gap-y-5">
          {STAGES.map((s, idx) => {
            const isActiveStage = !isError && idx === stageIndex
            const isCompletedStage = !isError && idx < stageIndex
            const isPendingStage = !isError && idx > stageIndex
            const placement = s.id === 4 ? 'col-span-2 col-start-2' : s.id === 5 ? 'col-span-2 col-start-4' : 'col-span-2'

            return (
              <div key={s.id} className={`${placement} flex flex-col items-center`}>
                <div
                  className={`
                    relative aspect-square w-20 rounded-full transition-all duration-500
                    sm:w-24
                    ${isActiveStage ? 'scale-110 drop-shadow-[0_0_18px_rgba(249,115,22,0.42)]' : ''}
                    ${isCompletedStage ? 'opacity-95 saturate-110' : ''}
                    ${isPendingStage ? 'opacity-45 grayscale-[20%]' : ''}
                    ${isError ? 'opacity-55 grayscale' : ''}
                  `}
                >
                  <Image
                    src={s.imageSrc}
                    alt={s.imageAlt}
                    fill
                    sizes="(max-width: 640px) 80px, 96px"
                    className="object-contain"
                    priority={s.id <= 3}
                  />
                </div>
                <p
                  className={`
                    mt-1.5 max-w-[7rem] text-[11px] font-bold leading-tight text-black transition-colors duration-300
                    sm:mt-2 sm:text-sm
                    ${isActiveStage ? 'text-black' : ''}
                    ${isPendingStage ? 'text-black/55' : ''}
                    ${isError ? 'text-black/55' : ''}
                  `}
                >
                  {s.label}
                </p>
              </div>
            )
          })}
        </div>

        <div className="mt-5 w-full max-w-xs space-y-2 sm:mt-6">
          <div className="space-y-1">
            <p className="text-sm font-bold text-black sm:text-base">{displayLabel}</p>
            <p className={`text-xs sm:text-sm ${isError ? 'text-red-600' : 'text-black/68'}`}>{displayDescription}</p>
          </div>

          <div className="pt-1.5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full rounded-full bg-[#f47a20] shadow-[0_0_12px_rgba(244,122,32,0.4)] transition-[width] duration-500 ease-out"
              style={{ width: `${percentInt}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-black/60 sm:text-xs">
            <span>Stage {stage.id}/5</span>
            <span>{percentInt}%</span>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}

