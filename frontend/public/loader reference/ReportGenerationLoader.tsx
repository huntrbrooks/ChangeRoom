'use client'


type ReportGenerationLoaderProps = {
  step: number
  steps: string[]
}

export default function ReportGenerationLoader({ step, steps }: ReportGenerationLoaderProps) {
  const total = steps.length
  const clamped = Math.min(Math.max(step, 1), total)
  const percent = Math.round((clamped / total) * 100)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur">
      <div className="glass-card max-w-md w-full border-0 shadow-2xl p-8 text-center rounded-2xl">
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-full mx-auto flex items-center justify-center relative">
            <div className="absolute inset-0 rounded-full border-4 border-[#ff1aff33]" />
            <div className="absolute inset-0 rounded-full border-4 border-t-[#ff1aff] border-transparent animate-spin shadow-[0_0_10px_#ff1aff,0_0_20px_#ff1aff]" />
            <div className="absolute left-1/2 -translate-x-1/2 -top-1 w-2 h-2 rounded-full bg-[#ff1aff] shadow-[0_0_10px_#ff1aff,0_0_18px_#ff1aff] animate-spin [animation-duration:0.9s]" />
          </div>
        </div>
        <h3 className="text-xl font-bold key-info text-heading mb-3">Loading Your Full Diagnostic Report</h3>
        <p className="text-muted-foreground mb-6">{steps[clamped - 1]}</p>
        <div className="w-full bg-muted rounded-full h-2 mb-4 overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_#ff1aff,0_0_18px_#ff1aff] bg-[#ff1aff] prog-w-${percent}`}
          />
        </div>
        <div className="flex justify-center space-x-2 mt-2">
          {Array.from({ length: total }).map((_, idx) => (
            <div
              key={idx}
              className={`w-2 h-2 rounded-full ${idx < clamped ? 'bg-[#ff1aff] shadow-[0_0_6px_#ff1aff]' : 'bg-muted-foreground/40'}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}


