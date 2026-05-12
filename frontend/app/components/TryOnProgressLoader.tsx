'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Images,
  type LucideIcon,
  ScanSearch,
  Shirt,
  Sparkles,
  WandSparkles,
} from 'lucide-react'

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
  Icon: LucideIcon
  targetPercent: number
}

const STAGES: Stage[] = [
  {
    id: 1,
    label: 'Reading photos',
    description: 'Reading your photos and garments',
    Icon: ScanSearch,
    targetPercent: 8,
  },
  {
    id: 2,
    label: 'Styling outfit',
    description: 'Pairing pieces for the best look',
    Icon: Shirt,
    targetPercent: 28,
  },
  {
    id: 3,
    label: 'Fitting garments',
    description: 'Applying garments on your model',
    Icon: Images,
    targetPercent: 58,
  },
  {
    id: 4,
    label: 'Polishing render',
    description: 'Polishing lighting and fit',
    Icon: WandSparkles,
    targetPercent: 82,
  },
  {
    id: 5,
    label: 'Ready',
    description: 'Your look is ready',
    Icon: Check,
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
  const CurrentIcon = isError ? Sparkles : stage.Icon
  const displayLabel = isError ? 'Generation failed' : stage.label
  const displayDescription = isError
    ? failureMessage || 'We could not generate this look. Please try again.'
    : stage.description
  const ringDegrees = Math.max(8, Math.min(100, percentInt)) * 3.6

  useEffect(() => {
    onStageChange?.(stage.id)
  }, [onStageChange, stage.id])

  return (
    <div
      className={`
        absolute inset-0 z-10 flex flex-col items-center justify-center
        bg-[#f8f6f2]/95 backdrop-blur-[3px]
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
      <style>
        {`
          @keyframes tryon-ring-spin {
            to { transform: rotate(360deg); }
          }
          @keyframes tryon-sweep {
            0% { transform: translateX(-120%); opacity: 0; }
            18% { opacity: .8; }
            55% { opacity: .45; }
            100% { transform: translateX(220%); opacity: 0; }
          }
          @keyframes tryon-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-5px); }
          }
        `}
      </style>

      <div className="flex w-full max-w-[31rem] flex-col items-center px-5 text-center sm:px-6">
        <div
          className="relative flex h-36 w-36 items-center justify-center sm:h-44 sm:w-44"
          style={{ animation: isError ? undefined : 'tryon-float 3.8s ease-in-out infinite' }}
        >
          <div
            className="absolute inset-0 rounded-full p-[4px] shadow-[0_18px_55px_rgba(16,17,20,0.13)]"
            style={{
              background: `conic-gradient(${isError ? '#ef4444' : '#f47a20'} ${ringDegrees}deg, rgba(16,17,20,0.13) 0deg)`,
            }}
            aria-hidden="true"
          >
            <div className="h-full w-full rounded-full bg-[#f8f6f2]" />
          </div>
          <div
            className="absolute inset-3 rounded-full border border-black/10"
            style={{ animation: isError ? undefined : 'tryon-ring-spin 9s linear infinite' }}
            aria-hidden="true"
          >
            <span className="absolute left-1/2 top-[-3px] h-2.5 w-8 -translate-x-1/2 rounded-full bg-[#f47a20] shadow-[0_0_18px_rgba(244,122,32,0.45)]" />
            <span className="absolute bottom-[-2px] right-6 h-1.5 w-5 rounded-full bg-[#0f766e]/70" />
          </div>
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-black/10 bg-white shadow-[0_16px_42px_rgba(15,23,42,0.12)] sm:h-28 sm:w-28">
            <CurrentIcon
              size={42}
              strokeWidth={1.65}
              className={isError ? 'text-red-500' : 'text-[#101114]'}
              aria-hidden="true"
            />
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          <p className="text-lg font-black leading-tight text-[#101114] sm:text-2xl">{displayLabel}</p>
          <p className={`text-sm sm:text-[15px] ${isError ? 'text-red-600' : 'text-[#454a52]'}`}>{displayDescription}</p>
        </div>

        <div className="mt-5 grid w-full grid-cols-5 gap-1.5 sm:gap-2">
          {STAGES.map((s, idx) => {
            const isActiveStage = !isError && idx === stageIndex
            const isCompletedStage = !isError && idx < stageIndex
            const isPendingStage = !isError && idx > stageIndex
            const StageIcon = s.Icon

            return (
              <div key={s.id} className="flex min-w-0 flex-col items-center">
                <div
                  className={`
                    flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-500 sm:h-10 sm:w-10
                    ${isActiveStage ? 'border-[#f47a20] bg-[#101114] text-white shadow-[0_0_18px_rgba(244,122,32,0.32)]' : ''}
                    ${isCompletedStage ? 'border-[#0f766e]/30 bg-[#0f766e] text-white' : ''}
                    ${isPendingStage ? 'border-black/10 bg-white text-black/38' : ''}
                    ${isError ? 'border-red-200 bg-white text-red-400' : ''}
                  `}
                >
                  <StageIcon size={17} strokeWidth={1.9} aria-hidden="true" />
                </div>
                <p
                  className={`
                    mt-1.5 max-w-[4.6rem] text-[10px] font-bold leading-tight transition-colors duration-300 sm:max-w-[5.6rem] sm:text-[11px]
                    ${isActiveStage ? 'text-[#101114]' : ''}
                    ${isCompletedStage ? 'text-[#0f766e]' : ''}
                    ${isPendingStage ? 'text-black/46' : ''}
                    ${isError ? 'text-black/48' : ''}
                  `}
                >
                  {s.label}
                </p>
              </div>
            )
          })}
        </div>

        <div className="mt-5 w-full max-w-sm space-y-2 sm:mt-6">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/10">
            <div
              className="relative h-full overflow-hidden rounded-full bg-[#101114] shadow-[0_0_12px_rgba(16,17,20,0.18)] transition-[width] duration-500 ease-out"
              style={{ width: `${percentInt}%` }}
            >
              <span
                className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-[#f47a20]/80 to-transparent"
                style={{ animation: isError ? undefined : 'tryon-sweep 2.2s ease-in-out infinite' }}
                aria-hidden="true"
              />
            </div>
          </div>
          <div className="mt-1 flex justify-between text-[11px] font-medium text-black/58 sm:text-xs">
            <span>Stage {stage.id}/5</span>
            <span>{percentInt}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}
