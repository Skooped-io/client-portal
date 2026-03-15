import { Search } from "lucide-react"
import { EmptyState } from "@/components/shared/empty-state"

export default function SeoPage() {
  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-nunito font-bold text-foreground">SEO</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Monitor your search engine visibility and keyword rankings.
        </p>
      </div>

      <EmptyState
        icon={Search}
        title="SEO reports coming soon"
        description="Your SEO dashboard is on the way. You'll soon be able to track keyword rankings, impressions, and your Google Search Console data."
      />
    </div>
  )
}
