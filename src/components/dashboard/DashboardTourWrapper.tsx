'use client'

import { useDashboardTour } from '@/hooks/useDashboardTour'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DashboardTourWrapperProps {
  className?: string
}

/**
 * Mounts the dashboard tour hook and renders a "Replay Tour" button.
 * This is a client component that must be included in the dashboard.
 */
export function DashboardTourWrapper({ className }: DashboardTourWrapperProps) {
  const { resetTour } = useDashboardTour()

  return (
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
  )
}
