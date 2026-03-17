import type { Metadata } from 'next'
import { MessageSquare } from "lucide-react"

export const metadata: Metadata = {
  title: 'Messages',
}
import { EmptyState } from "@/components/shared/empty-state"

export default function MessagesPage() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 lg:px-8 max-w-7xl mx-auto space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-nunito font-bold text-foreground">Messages</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Communicate directly with the Skooped team.
        </p>
      </div>

      <EmptyState
        icon={MessageSquare}
        title="Messages coming soon"
        description="Your messaging inbox is on the way. You'll be able to send and receive messages from the Skooped team directly in the portal."
      />
    </div>
  )
}
