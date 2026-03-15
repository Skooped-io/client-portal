import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Sidebar } from "@/components/layout/sidebar"

interface PortalLayoutProps {
  children: React.ReactNode
}

export default async function PortalLayout({ children }: PortalLayoutProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Check if onboarding is incomplete — redirect to wizard
  const { data: onboarding } = await supabase
    .from("onboarding_progress")
    .select("is_complete, current_step")
    .eq("user_id", user.id)
    .single()

  if (onboarding && !onboarding.is_complete) {
    redirect(`/onboarding/step/${onboarding.current_step}`)
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single()

  const fullName = profile?.full_name ?? user.email ?? "User"

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar userEmail={user.email ?? ""} userName={fullName} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
