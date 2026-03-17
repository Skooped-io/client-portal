import type { Metadata } from 'next'
import { Globe } from "lucide-react"

export const metadata: Metadata = {
  title: 'Website',
}
import { EmptyState } from "@/components/shared/empty-state"

export default function WebsitePage() {
  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-nunito font-bold text-foreground">Website</h1>
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
