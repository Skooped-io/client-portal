'use client'

import { useDashboardTour } from '@/hooks/useDashboardTour'
import { MobileWelcomeCard } from '@/components/onboarding/MobileWelcomeCard'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DashboardTourWrapperProps {
  className?: string
  isReady?: boolean
}

/**
 * Mounts the dashboard tour hook and renders a "Replay Tour" button.
 * Also renders the MobileWelcomeCard for mobile users.
 * This is a client component that must be included in the dashboard.
 */
export function DashboardTourWrapper({ className, isReady = true }: DashboardTourWrapperProps) {
  const { resetTour, showMobileWelcome, dismissMobileWelcome } = useDashboardTour(isReady)

  return (
    <>
      <button
        onClick={resetTour}
        className={cn(
          'flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors',
          className
        )}
        title="Replay dashboard tour"
      >
        <HelpCircle className="w-3.5 h-3.5" />
        Tour
      </button>

      <MobileWelcomeCard show={showMobileWelcome} onDismiss={dismissMobileWelcome} />
    </>
  )
}
