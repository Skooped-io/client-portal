import { BarChart3 } from "lucide-react"
import { EmptyState } from "@/components/shared/empty-state"

export default function AnalyticsPage() {
  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-nunito font-bold text-foreground">Analytics</h1>
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
