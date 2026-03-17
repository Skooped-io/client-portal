import type { Metadata } from 'next'
import { MessageSquare } from "lucide-react"

export const metadata: Metadata = {
  title: 'Messages',
}
import { EmptyState } from "@/components/shared/empty-state"

export default function MessagesPage() {
  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-nunito font-bold text-foreground">Messages</h1>
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
