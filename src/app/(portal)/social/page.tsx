import type { Metadata } from 'next'
import { Instagram } from "lucide-react"

export const metadata: Metadata = {
  title: 'Social',
}
import { EmptyState } from "@/components/shared/empty-state"

export default function SocialPage() {
  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-nunito font-bold text-foreground">Social</h1>
        <p className="text-muted-foreground text-sm mt-1">
          View your social media content calendar and post performance.
        </p>
      </div>

      <EmptyState
        icon={Instagram}
        title="Social media dashboard coming soon"
        description="Your social media hub is coming. You'll be able to view scheduled posts, review content, and track engagement across platforms."
      />
    </div>
  )
}
