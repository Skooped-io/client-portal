import { Megaphone } from "lucide-react"
import { EmptyState } from "@/components/shared/empty-state"

export default function AdsPage() {
  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-nunito font-bold text-foreground">Ads</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Track your paid advertising performance and spend.
        </p>
      </div>

      <EmptyState
        icon={Megaphone}
        title="Ads performance coming soon"
        description="Your ads dashboard is in the works. Soon you'll see campaign performance, spend summaries, and ROI data all in one place."
      />
    </div>
  )
}
