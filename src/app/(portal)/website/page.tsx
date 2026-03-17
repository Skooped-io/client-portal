import type { Metadata } from 'next'
import { Globe } from "lucide-react"

export const metadata: Metadata = {
  title: 'Website',
}
import { EmptyState } from "@/components/shared/empty-state"

export default function WebsitePage() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 lg:px-8 max-w-7xl mx-auto space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-nunito font-bold text-foreground">Website</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Monitor your website health, speed, and Core Web Vitals.
        </p>
      </div>

      <EmptyState
        icon={Globe}
        title="Website health dashboard coming soon"
        description="Your website health panel is being built. You'll soon see uptime, Core Web Vitals, and performance scores for your site."
      />
    </div>
  )
}
