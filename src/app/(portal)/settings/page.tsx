import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BusinessProfileForm } from './business-profile-form'
import { ConnectedAccounts } from '@/components/settings/connected-accounts'
import { AccountSettings } from '@/components/settings/account-settings'
import type { BusinessProfile, OauthConnection } from '@/lib/types'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const orgId = await getCurrentOrgId(supabase)

  let profile: BusinessProfile | null = null
  let googleConnection: OauthConnection | null = null
  let metaConnection: OauthConnection | null = null

  if (orgId) {
    const [profileResult, oauthResult] = await Promise.all([
      supabase.from('business_profiles').select('*').eq('org_id', orgId).single(),
      supabase.from('oauth_connections').select('*').eq('org_id', orgId),
    ])

    profile = profileResult.data
    const connections = oauthResult.data ?? []
    googleConnection = (connections.find((c) => c.provider === 'google') ?? null) as OauthConnection | null
    metaConnection = (connections.find((c) => c.provider === 'meta') ?? null) as OauthConnection | null
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-nunito font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your business profile, connected accounts, and preferences.
        </p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="mb-6 bg-card border border-border rounded-xl p-1 h-auto">
          <TabsTrigger
            value="profile"
            className="rounded-lg text-sm font-dm-sans data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            Business Profile
          </TabsTrigger>
          <TabsTrigger
            value="connected"
            className="rounded-lg text-sm font-dm-sans data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            Connected Accounts
          </TabsTrigger>
          <TabsTrigger
            value="account"
            className="rounded-lg text-sm font-dm-sans data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            Account
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <BusinessProfileForm profile={profile} />
        </TabsContent>

        <TabsContent value="connected">
          <ConnectedAccounts
            googleConnection={googleConnection}
            metaConnection={metaConnection}
          />
        </TabsContent>

        <TabsContent value="account">
          <AccountSettings email={user?.email ?? ''} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
