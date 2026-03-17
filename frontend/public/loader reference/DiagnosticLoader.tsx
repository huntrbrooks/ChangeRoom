import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import LoadingSpinner from '@/components/LoadingSpinner'
import QuestionGenerationLoader from '@/components/QuestionGenerationLoader'

interface DiagnosticLoaderProps {
  showLoader: boolean
  loading: boolean
  error: string
  questionsLength: number
  loaderStep: number
  isGeneratingQuestions: boolean
  visualProgress: number
  phaseLabel: string
  optimisticPercent: number
  indeterminateFinal: boolean
  showTryAgain: boolean
  showErrorDetails: boolean
  showReadyPrompt: boolean
  retrying: boolean
  onToggleErrorDetails: () => void
  onRetry: () => void
  onContinueLater: () => void
  onStart: () => void
  onLoadQuestions: () => void
  onGenerateQuestions: () => void
  onReset: () => void
  onTestAI: () => void
  onSignIn: () => void
}

export function DiagnosticLoader({
  showLoader,
  loading,
  error,
  questionsLength,
  loaderStep,
  isGeneratingQuestions,
  visualProgress,
  phaseLabel,
  optimisticPercent,
  indeterminateFinal,
  showTryAgain,
  showErrorDetails,
  showReadyPrompt,
  retrying,
  onToggleErrorDetails,
  onRetry,
  onContinueLater,
  onStart,
  onLoadQuestions,
  onGenerateQuestions,
  onReset,
  onTestAI,
  onSignIn
}: DiagnosticLoaderProps) {
  // Show the beautiful loader when generating questions (HIGHEST PRIORITY)
  if (showLoader) {
    return (
      <>
        <QuestionGenerationLoader
          currentStep={loaderStep}
          totalSteps={5}
          isGenerating={isGeneratingQuestions}
          percentOverride={visualProgress}
          phaseLabel={phaseLabel}
          optimisticPercent={optimisticPercent}
          indeterminateFinal={indeterminateFinal}
        />
        {/* Try Again overlay - only if generation actually failed or we timed out; keep loader visible behind */}
        {showTryAgain && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-transparent">
            <div className="w-full max-w-md m-4">
              <div className="rounded-xl glass-card border border-warning/30 shadow-2xl">
                <div className="p-4 sm:p-5">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-3">We couldn’t fetch your questions yet.</p>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline mb-3"
                      onClick={onToggleErrorDetails}
                    >{showErrorDetails ? 'Hide details' : 'Show details'}</button>
                    {showErrorDetails && (
                      <div className="text-left text-xs bg-muted/30 border border-border/40 rounded-md p-3 mb-3 break-words whitespace-pre-wrap">
                        {error || 'No additional details available.'}
                      </div>
                    )}
                    <div className="flex gap-3 justify-center">
                      <Button
                        onClick={onRetry}
                        disabled={retrying}
                        variant="default"
                      >{retrying ? 'Trying…' : 'Try Again'}</Button>
                      <Button
                        variant="outline"
                        onClick={onContinueLater}
                      >Continue later</Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {showReadyPrompt && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <div className="rounded-xl glass-card shadow-xl w-full max-w-md">
              <div className="p-6">
                <h3 className="text-xl font-semibold mb-2 text-heading">Preference analysis complete</h3>
                <p className="text-muted-foreground mb-6">Are you ready to begin?</p>
                <div className="flex gap-3">
                  <Button
                    className="flex-1"
                    onClick={onStart}
                  >
                    Yes, let’s start
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={onContinueLater}
                  >
                    Continue later
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  if (loading && questionsLength === 0) {
    return (
      <div className="min-h-screen-dvh bg-background flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          <Card className="glass-card border-0 shadow-xl">
            <CardContent className="p-8">
              <LoadingSpinner 
                size="lg" 
                text="Loading your personalized questions..." 
              />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen-dvh bg-background flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          <Card className="glass-card border-0 shadow-xl">
            <CardContent className="p-8">
              <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6 mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                  <h3 className="text-lg font-semibold text-destructive">Error</h3>
                </div>
                <p className="text-destructive/80 mb-6">{error}</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button variant="outline" onClick={onLoadQuestions}>
                    Try Again
                  </Button>
                  <Button variant="outline" onClick={onGenerateQuestions}>
                    Generate Personalized Questions
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={onReset}
                  >
                    Start Fresh
                  </Button>
                  <Button variant="outline" onClick={onTestAI}>
                    Test AI Services
                  </Button>
                  {error.includes('sign in') && (
                    <Button onClick={onSignIn}>
                      Sign In
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return null
}

