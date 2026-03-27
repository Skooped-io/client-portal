interface StepProgressProps {
  currentStep: number
  totalSteps: number
  completedSteps: number[]
}

const STEP_LABELS = ['Template', 'Business', 'Location', 'Services', 'Google', 'Social', 'Plan']

export function StepProgress({ currentStep, totalSteps, completedSteps }: StepProgressProps) {
  const progressPercent = ((currentStep - 1) / (totalSteps - 1)) * 100

  return (
    <div className="w-full" data-testid="step-progress">
      {/* Progress bar */}
      <div className="w-full h-1.5 bg-border rounded-full mb-6">
        <div
          className="h-full bg-strawberry rounded-full transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Step indicators */}
      <div className="flex items-center justify-between">
        {Array.from({ length: totalSteps }, (_, i) => {
          const step = i + 1
          const isCompleted = completedSteps.includes(step)
          const isCurrent = step === currentStep
          const isUpcoming = step > currentStep && !isCompleted

          return (
            <div key={step} className="flex flex-col items-center gap-1.5">
              <div
                className={[
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-dm-sans font-medium transition-colors',
                  isCompleted
                    ? 'bg-strawberry text-white'
                    : isCurrent
                    ? 'bg-strawberry/20 text-strawberry border-2 border-strawberry'
                    : 'bg-muted text-muted-foreground',
                ].join(' ')}
                aria-label={`Step ${step}: ${STEP_LABELS[i]}`}
              >
                {isCompleted ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path
                      d="M2 6l3 3 5-5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  step
                )}
              </div>
              <span
                className={[
                  'text-xs font-dm-sans hidden sm:block',
                  isCurrent ? 'text-strawberry font-medium' : 'text-muted-foreground',
                ].join(' ')}
              >
                {STEP_LABELS[i]}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
