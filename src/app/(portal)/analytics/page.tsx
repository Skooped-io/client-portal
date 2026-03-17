import type { Metadata } from 'next'
import { BarChart3 } from "lucide-react"

export const metadata: Metadata = {
  title: 'Analytics',
}
import { EmptyState } from "@/components/shared/empty-state"

export default function AnalyticsPage() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 lg:px-8 max-w-7xl mx-auto space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-nunito font-bold text-foreground">Analytics</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Track your website performance and visitor data.
        </p>
      </div>

      <EmptyState
        icon={BarChart3}
        title="Analytics dashboard coming soon"
        description="We're building your analytics dashboard. Check back soon to see detailed insights about your website traffic and performance."
      />
    </div>
  )
}
