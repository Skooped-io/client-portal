import 'driver.js/dist/driver.css'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { PageTransition } from '@/components/motion/PageTransition'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { PortalShell } from '@/components/layout/PortalShell'

interface PortalLayoutProps {
  children: React.ReactNode
}

export default async function PortalLayout({ children }: PortalLayoutProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if onboarding is incomplete — redirect to wizard
  const { data: onboarding } = await supabase
    .from('onboarding_progress')
    .select('is_complete, current_step')
    .eq('user_id', user.id)
    .single()

  if (onboarding && !onboarding.is_complete) {
    redirect(`/onboarding/step/${onboarding.current_step}`)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const fullName = profile?.full_name ?? user.email ?? 'User'
  const businessName: string | undefined = undefined // TODO: add business_name to profiles migration

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Fixed sidebar */}
      <Sidebar userEmail={user.email ?? ''} userName={fullName} />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top bar — client shell handles command palette state */}
        <PortalShell
          clientName={fullName}
          businessName={businessName}
        >
          <main className="flex-1 overflow-y-auto scrollbar-thin">
            <PageTransition>
              {children}
            </PageTransition>
          </main>
        </PortalShell>
      </div>
    </div>
  )
}
