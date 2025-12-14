'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { ArrowRight, CheckCircle, Loader2 } from 'lucide-react'
import Image from 'next/image'
import React from 'react'

interface QuestionGenerationLoaderProps {
  currentStep?: number
  totalSteps?: number
  isGenerating?: boolean
  percentOverride?: number
  optimisticPercent?: number
  phaseLabel?: string
  indeterminateFinal?: boolean
}

export default function QuestionGenerationLoader({ 
  currentStep = 1,
  totalSteps = 5,
  isGenerating = true,
  percentOverride,
  optimisticPercent,
  phaseLabel,
  indeterminateFinal
}: QuestionGenerationLoaderProps) {
  const computed = (currentStep / totalSteps) * 100
  const serverPercent = typeof percentOverride === 'number' ? Math.max(0, Math.min(100, percentOverride)) : undefined
  const optimistic = typeof optimisticPercent === 'number' ? Math.max(0, Math.min(100, optimisticPercent)) : undefined
  // Respect server-smoothed progress exclusively when provided; avoid optimistic overshoot
  const progress = typeof serverPercent === 'number'
    ? serverPercent
    : typeof optimistic === 'number'
      ? optimistic
      : computed
  const displayedStep = Math.max(1, Math.min(totalSteps, Math.ceil((progress / 100) * totalSteps)))
  const stepsContainerRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const el = document.getElementById(`loader-step-${currentStep}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentStep])

  const iconFilter: React.CSSProperties = { 
    filter: 'brightness(0) saturate(100%) invert(1) drop-shadow(0 0 12px rgba(255,255,255,0.35))'
  }

  const steps = [
    {
      img: '/Icon set/Icon-01.svg',
      title: 'Analyzing your responses',
      description: 'Processing your unique patterns and experiences',
      color: 'from-blue-500 to-indigo-500'
    },
    {
      img: '/Icon set/Icon-02.svg',
      title: 'Identifying key areas',
      description: 'Mapping your healing journey priorities',
      color: 'from-green-500 to-emerald-500'
    },
    {
      img: '/Icon set/Icon-03.svg',
      title: 'Personalizing questions',
      description: 'Creating questions tailored to your needs',
      color: 'from-purple-500 to-pink-500'
    },
    {
      img: '/Icon set/Icon-04.svg',
      title: 'Optimizing flow',
      description: 'Ensuring smooth question progression',
      color: 'from-yellow-500 to-orange-500'
    },
    {
      img: '/Icon set/Icon-12.svg',
      title: 'Finalizing your journey',
      description: 'Preparing your personalized experience',
      color: 'from-red-500 to-rose-500'
    }
  ]

  return (
    <div className="min-h-screen-dvh bg-background flex items-center justify-center p-6">
      <div className="max-w-2xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="relative inline-block">
            <div className="mx-auto mb-4 animate-float">
              <Image
                src="/Icon set/Icon-03.svg"
                alt="loader art"
                width={96}
                height={96}
                className="w-24 h-auto"
                style={iconFilter}
                priority
              />
            </div>
          </div>
          
          <h1 className="text-3xl font-bold key-info text-heading">
            Creating Your Personal Journey
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Our AI is analyzing your responses to create a truly personalized healing experience
          </p>
        </div>

        {/* Progress */}
        <Card className="bg-background border border-border/50 shadow-2xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <CardTitle className="text-lg font-semibold text-foreground">
                {phaseLabel ? phaseLabel : 'Progress'}
              </CardTitle>
              <Badge variant="glass" size="lg">
                Step {displayedStep} of {totalSteps}
              </Badge>
            </div>
            
            <Progress value={progress} variant="default" glow size="lg" className="h-3 mb-4" />
            
            <div className="text-center text-sm text-muted-foreground">
              {Math.round(progress)}% Complete
            </div>
          </CardContent>
        </Card>

        {/* Steps */}
        <div ref={stepsContainerRef} className="space-y-4 max-h-[50vh] overflow-auto">
          {steps.map((step, index) => {
            const imgSrc = step.img
            const visualStep = Math.max(currentStep, displayedStep)
            const isActive = index + 1 === visualStep
            const isCompleted = index + 1 < visualStep
            const isPending = index + 1 > visualStep
            
            return (
              <Card 
                key={index}
                id={`loader-step-${index + 1}`}
                className={cn(
                  'transition-all duration-500 bg-background border border-border/50',
                  isActive ? 'shadow-2xl' : 'shadow',
                  isCompleted ? 'opacity-60' : '',
                  isPending ? 'opacity-40' : ''
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      'w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 bg-background',
                      isActive ? 'scale-110' : '',
                      isCompleted ? '' : '',
                      isPending ? '' : ''
                    )}>
                      {isCompleted ? (
                        <CheckCircle className="h-6 w-6 text-success" />
                      ) : (
                        <Image 
                          src={imgSrc} 
                          alt="step icon" 
                          width={32} 
                          height={32} 
                          className={cn('w-8 h-8 transition-all duration-300', isActive ? 'animate-pulse' : '')}
                          style={iconFilter}
                        />
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className={cn(
                          'font-semibold transition-colors duration-300',
                          isActive ? 'text-foreground' : 'text-muted-foreground',
                          isCompleted ? 'text-success' : '',
                          isPending ? 'text-muted-foreground/50' : ''
                        )}>
                          {step.title}
                        </h3>
                        {isActive && (
                          <div className="flex gap-1 loader-dots">
                            {[0, 1, 2].map((i) => (
                              <div key={i} className="w-1 h-1 bg-primary rounded-full animate-pulse" />
                            ))}
                          </div>
                        )}
                      </div>
                      <p className={cn(
                        'text-sm transition-colors duration-300',
                        isActive ? 'text-foreground' : 'text-muted-foreground',
                        isCompleted ? 'text-success/80' : '',
                        isPending ? 'text-muted-foreground/50' : ''
                      )}>
                        {step.description}
                      </p>
                    </div>
                    
                    {isActive && (
                      visualStep === totalSteps && indeterminateFinal ? (
                        <Loader2 className="h-5 w-5 text-primary animate-spin" />
                      ) : (
                        <ArrowRight className="h-5 w-5 text-primary animate-pulse" />
                      )
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Status Message */}
        <Card className="bg-background border border-border/50 shadow-2xl text-center">
          <CardContent className="p-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              <span className="text-sm font-medium text-foreground">
                {isGenerating ? 'Generating...' : 'Almost ready...'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              This process typically takes 30-60 seconds. Please don&apos;t refresh the page.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
