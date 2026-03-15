import { Globe, Search, Phone, Star, ArrowRight } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { StatCard } from "@/components/dashboard/stat-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Suspense } from "react"

function StatCardSkeleton() {
  return (
    <Card className="bg-card border-border rounded-xl p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-20" />
        </div>
        <Skeleton className="h-11 w-11 rounded-xl" />
      </div>
    </Card>
  )
}

async function DashboardStats() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000)
    .toISOString()
    .split("T")[0]

  const [analyticsResult, gscResult, gbpResult, reviewsResult, profileResult] =
    await Promise.all([
      supabase
        .from("analytics_daily")
        .select("sessions")
        .gte("date", thirtyDaysAgo),
      supabase
        .from("gsc_daily")
        .select("impressions")
        .gte("date", thirtyDaysAgo),
      supabase
        .from("gbp_daily")
        .select("phone_calls")
        .gte("date", thirtyDaysAgo),
      supabase.from("gbp_reviews").select("id"),
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user?.id ?? "")
        .single(),
    ])

  const sessions =
    analyticsResult.data?.reduce((sum, row) => sum + (row.sessions ?? 0), 0) ?? 0
  const impressions =
    gscResult.data?.reduce((sum, row) => sum + (row.impressions ?? 0), 0) ?? 0
  const phoneCalls =
    gbpResult.data?.reduce((sum, row) => sum + (row.phone_calls ?? 0), 0) ?? 0
  const reviewCount = reviewsResult.data?.length ?? 0

  const userName = profileResult.data?.full_name ?? user?.email ?? "there"
  const firstName = userName.split(" ")[0]

  const now = new Date()
  const dateString = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <>
      {/* Welcome header */}
      <div className="mb-8">
        <h1 className="text-2xl font-nunito font-bold text-foreground">
          Welcome back, {firstName}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{dateString}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Website Visits"
          value={sessions}
          icon={Globe}
        />
        <StatCard
          label="Google Impressions"
          value={impressions}
          icon={Search}
        />
        <StatCard
          label="Phone Calls"
          value={phoneCalls}
          icon={Phone}
        />
        <StatCard
          label="Google Reviews"
          value={reviewCount}
          icon={Star}
        />
      </div>
    </>
  )
}

export default async function DashboardPage() {
  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <Suspense
        fallback={
          <>
            <div className="mb-8 space-y-2">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
              {[...Array(4)].map((_, i) => (
                <StatCardSkeleton key={i} />
              ))}
            </div>
          </>
        }
      >
        <DashboardStats />
      </Suspense>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="bg-card border-border rounded-xl">
            <CardHeader>
              <CardTitle className="text-base font-nunito">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-muted-foreground text-sm">
                  No recent activity — we&apos;re setting things up!
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div>
          <Card className="bg-card border-border rounded-xl">
            <CardHeader>
              <CardTitle className="text-base font-nunito">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/settings">
                <Button
                  variant="ghost"
                  className="w-full justify-between text-foreground hover:bg-card-hover rounded-xl"
                >
                  Update Business Profile
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </Button>
              </Link>
              <Link href="/analytics">
                <Button
                  variant="ghost"
                  className="w-full justify-between text-foreground hover:bg-card-hover rounded-xl"
                >
                  View Reports
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </Button>
              </Link>
              <Link href="/messages">
                <Button
                  variant="ghost"
                  className="w-full justify-between text-foreground hover:bg-card-hover rounded-xl"
                >
                  Send Message
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
