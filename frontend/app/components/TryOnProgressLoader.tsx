'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'

type TryOnProgressLoaderProps = {
  /** Whether generation is currently running */
  isActive: boolean
  /** Set true when backend generation finished (image URL ready) */
  isComplete: boolean
  /** Called after the fade-out finishes */
  onFinished?: () => void
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
const EXIT_FADE_MS = 500

export function TryOnProgressLoader({ isActive, isComplete, onFinished }: TryOnProgressLoaderProps) {
  const [progress, setProgress] = useState(0)
  const [stageIndex, setStageIndex] = useState(0)
  const [isExiting, setIsExiting] = useState(false)
  const progressRef = useRef(0)
  const stageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stageUnlockRef = useRef<number | null>(null)

  // Reset when (re)activated
  useEffect(() => {
    if (isActive) {
      setProgress(0)
      progressRef.current = 0
      setStageIndex(0)
      setIsExiting(false)
      stageUnlockRef.current = Date.now() + MIN_STAGE_MS
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
      const isFinal = stageIndex >= STAGES.length - 1
      const allowedTarget = isFinal && isComplete ? 100 : target

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
  }, [isActive, isComplete, isExiting, stageIndex])

  // Advance stages only after minimum time AND reaching the stage target
  useEffect(() => {
    if (!isActive || isExiting) return

    if (stageTimerRef.current) {
      clearInterval(stageTimerRef.current)
      stageTimerRef.current = null
    }

    stageUnlockRef.current = Date.now() + MIN_STAGE_MS

    stageTimerRef.current = setInterval(() => {
      const now = Date.now()
      const unlockAt = stageUnlockRef.current ?? 0
      const currentStage = STAGES[Math.min(stageIndex, STAGES.length - 1)]
      const target = currentStage.targetPercent
      const isFinal = stageIndex >= STAGES.length - 1
      const allowedTarget = isFinal && isComplete ? 100 : target
      const pct = progressRef.current

      if (now >= unlockAt && pct >= allowedTarget - 0.5 && stageIndex < STAGES.length - 1) {
        setStageIndex((prev) => Math.min(prev + 1, STAGES.length - 1))
        stageUnlockRef.current = Date.now() + MIN_STAGE_MS
      }
    }, 250)

    return () => {
      if (stageTimerRef.current) {
        clearInterval(stageTimerRef.current)
        stageTimerRef.current = null
      }
    }
  }, [isActive, isExiting, stageIndex, isComplete])

  // Snap to final stage and fade out once complete
  useEffect(() => {
    if (!isActive || !isComplete || isExiting) return
    setStageIndex(STAGES.length - 1)
    setProgress(100)
    progressRef.current = 100
    setIsExiting(true)

    const timer = setTimeout(() => {
      onFinished?.()
      setIsExiting(false)
    }, EXIT_FADE_MS)

    return () => clearTimeout(timer)
  }, [isActive, isComplete, isExiting, onFinished])

  const stage = useMemo(() => STAGES[Math.min(stageIndex, STAGES.length - 1)], [stageIndex])
  const percentInt = Math.round(progress)

  return (
    <div
      className={`
        absolute inset-0 z-10 flex flex-col items-center justify-center 
        bg-white/92 backdrop-blur-sm transition-opacity duration-500
        ${isExiting ? 'opacity-0' : 'opacity-100'}
      `}
      aria-live="polite"
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
            <img
              src={stage.icon}
              alt={stage.label}
              className="w-12 h-12 sm:w-14 sm:h-14 object-contain relative z-10"
              loading="eager"
              decoding="async"
            />
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-sm sm:text-base font-bold uppercase tracking-wide text-black">{stage.label}</p>
          <p className="text-xs sm:text-sm text-black/70">{stage.description}</p>
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


