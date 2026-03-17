'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { ArrowRight, CheckCircle, Loader2 } from 'lucide-react'
import Image from 'next/image'
import React from 'react'

interface DiagnosticAnalysisLoaderProps {
  currentStep?: number
  totalSteps?: number
  progress?: number
  indeterminateFinal?: boolean
}

export default function DiagnosticAnalysisLoader({ 
  currentStep = 1,
  totalSteps = 5,
  progress,
  indeterminateFinal = false
}: DiagnosticAnalysisLoaderProps) {
  const pct = Math.max(0, Math.min(100, typeof progress === 'number' ? progress : (currentStep / totalSteps) * 100))
  const stepsContainerRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const el = document.getElementById(`analysis-loader-step-${currentStep}`)
    if (el) {
      // Try native centering first
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
      // Then adjust within the scroll container to keep the step centered
      if (stepsContainerRef.current) {
        const container = stepsContainerRef.current
        const targetTop = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2
        container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })
      }
    }
  }, [currentStep])

  const iconFilter: React.CSSProperties = { 
    filter: 'brightness(0) saturate(100%) invert(1) drop-shadow(0 0 12px rgba(255,255,255,0.35))'
  }

  const steps = [
    {
      img: '/Icon set/Icon-01.svg',
      title: 'Processing your responses',
      description: 'Analyzing patterns and themes in your answers',
      color: 'from-blue-500 to-indigo-500'
    },
    {
      img: '/Icon set/Icon-02.svg',
      title: 'Identifying core insights',
      description: 'Extracting key psychological markers and growth areas',
      color: 'from-green-500 to-emerald-500'
    },
    {
      img: '/Icon set/Icon-03.svg',
      title: 'Mapping trauma patterns',
      description: 'Understanding your unique healing journey pathways',
      color: 'from-purple-500 to-pink-500'
    },
    {
      img: '/Icon set/Icon-04.svg',
      title: 'Generating personalized summary',
      description: 'Creating your tailored prognostic overview',
      color: 'from-orange-500 to-red-500'
    },
    {
      img: '/Icon set/Icon-12.svg',
      title: 'Finalizing your results',
      description: 'Preparing your comprehensive prognostic profile',
      color: 'from-red-500 to-rose-500'
    }
  ]

  return (
    <div className="fixed inset-0 z-50 min-h-screen-dvh bg-background flex items-start justify-center p-6 overflow-y-auto pt-[calc(env(safe-area-inset-top,_0px)_+_72px)] pb-8">
      <div className="max-w-2xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="relative inline-block">
            <div className="mx-auto mt-2 sm:mt-0 mb-6 animate-float">
              <Image
                src="/Icon set/Icon-07.svg"
                alt="analysis art"
                width={96}
                height={96}
                className="block mx-auto w-20 sm:w-24 h-auto object-contain"
                style={iconFilter}
                priority
              />
            </div>
          </div>
          
          <h1 className="text-3xl font-bold key-info text-heading">
            Analyzing Your Journey
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            We&rsquo;re diving deep into your responses to understand your unique path to healing
          </p>
        </div>

        {/* Progress */}
        <Card className="bg-background border border-border/50 shadow-2xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <CardTitle className="text-lg font-semibold text-foreground">
                Analysis Progress
              </CardTitle>
              <Badge variant="glass" size="lg">
                Step {currentStep} of {totalSteps}
              </Badge>
            </div>
            
            <Progress 
              value={pct} 
              variant="neonPinkGlow"
              glow
              size="lg"
              className="h-3 mb-4"
            />

            <div className="text-center text-sm text-muted-foreground mb-2">
              {Math.round(pct)}% Complete
            </div>

            <div className="space-y-4 max-h-[50vh] overflow-auto" ref={stepsContainerRef}>
              {steps.map((step, index) => {
                const stepNumber = index + 1
                const isActive = currentStep === stepNumber
                const isComplete = currentStep > stepNumber
                const isPending = currentStep < stepNumber

                return (
                  <div 
                    key={stepNumber}
                    id={`analysis-loader-step-${stepNumber}`}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-lg border transition-all duration-500",
                      isActive && "border-primary/40 bg-primary/5 shadow-md",
                      isComplete && "border-success/40 bg-success/5",
                      isPending && "border-muted/30 bg-muted/10 opacity-60"
                    )}
                  >
                    <div className="relative flex-shrink-0">
                      <div className={cn(
                        "w-12 h-12 rounded-lg flex items-center justify-center transition-all duration-500",
                        isActive && "animate-pulse shadow-lg",
                        isComplete && "bg-success/20",
                        isPending && "bg-muted/30"
                      )}>
                        {isComplete ? (
                          <CheckCircle className="h-6 w-6 text-success" />
                        ) : (
                          <div className="relative">
                            <Image 
                              src={step.img} 
                              alt={`Step ${stepNumber}`}
                              width={32} 
                              height={32}
                              className={cn(
                                "w-8 h-8 transition-all duration-500",
                                isActive && "animate-pulse",
                                isComplete && "opacity-80",
                                isPending && "opacity-40"
                              )}
                              style={iconFilter}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className={cn(
                          "font-semibold text-base transition-colors duration-300",
                          isActive && "text-primary",
                          isComplete && "text-success",
                          isPending && "text-muted-foreground"
                        )}>
                          {step.title}
                        </h4>
                        {isActive && (
                          <div className="flex items-center gap-1 text-primary">
                            <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                            <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse delay-75" />
                            <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse delay-150" />
                          </div>
                        )}
                      </div>
                      <p className={cn(
                        "text-sm transition-colors duration-300",
                        isActive && "text-foreground",
                        isComplete && "text-muted-foreground",
                        isPending && "text-muted-foreground/60"
                      )}>
                        {step.description}
                      </p>
                    </div>

                    {isActive && (
                      currentStep === totalSteps && indeterminateFinal ? (
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                      ) : (
                        <ArrowRight className="w-5 h-5 text-primary animate-pulse" />
                      )
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            This analysis is personalized to your unique responses and experiences
          </p>
        </div>
      </div>
    </div>
  )
}
