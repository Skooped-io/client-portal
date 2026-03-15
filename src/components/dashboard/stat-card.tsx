import { type LucideIcon } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface StatCardProps {
  label: string
  value: number
  icon: LucideIcon
  trend?: number
  suffix?: string
}

export function StatCard({ label, value, icon: Icon, trend, suffix }: StatCardProps) {
  const isNoData = value === 0

  return (
    <Card className="bg-card border-border rounded-xl p-6 hover:shadow-sm transition-shadow" data-testid="stat-card">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground font-dm-sans">{label}</p>
          {isNoData ? (
            <p className="text-sm text-muted-foreground mt-1">No data yet</p>
          ) : (
            <p className="text-2xl font-nunito font-bold text-foreground mt-0.5">
              {value.toLocaleString()}
              {suffix && <span className="text-base font-medium ml-0.5">{suffix}</span>}
            </p>
          )}
        </div>
        <div className="p-3 bg-strawberry/10 rounded-xl shrink-0 ml-4">
          <Icon className="w-5 h-5 text-strawberry" />
        </div>
      </div>

      {!isNoData && trend !== undefined && (
        <p
          className={cn(
            "text-xs mt-2",
            trend > 0 ? "text-[#4CAF50]" : trend < 0 ? "text-strawberry" : "text-muted-foreground"
          )}
        >
          {trend > 0 ? `+${trend}%` : `${trend}%`} from last month
        </p>
      )}

      {isNoData && (
        <p className="text-xs text-muted-foreground mt-2">
          We&apos;re setting things up for you
        </p>
      )}
    </Card>
  )
}
