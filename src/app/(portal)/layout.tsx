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
