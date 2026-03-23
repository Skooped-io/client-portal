import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import SettingsPage from './settings-client'
import type { SettingsPageData, SettingsProfile, SettingsTeamMember, SettingsPlan } from './settings-client'

export const metadata: Metadata = { title: 'Settings' }
export const revalidate = 300

const PLAN_FEATURES: Record<string, string[]> = {
  Starter: ['SEO Monitoring', 'Google Business Profile', 'Monthly Reports'],
  Growth: ['SEO Monitoring', 'Google Ads Management', 'Monthly Reports', 'Social Content', '1 Team Seat'],
  Scale: ['SEO Monitoring', 'Google Ads Management', 'Weekly Reports', 'Social Content', 'Priority Support', '3 Team Seats'],
}

const PLAN_PRICES: Record<string, string> = {
  Starter: '$49',
  Growth: '$99',
  Scale: '$149',
}

export default async function SettingsServerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const orgId = await getCurrentOrgId(supabase)

  if (!orgId || !user) return <SettingsPage />

  const [profileRes, bpRes, membersRes, subscriptionRes] = await Promise.all([
    supabase.from('profiles').select('full_name, phone').eq('id', user.id).single(),
    supabase.from('business_profiles').select('business_name, phone, email').eq('org_id', orgId).single(),
    supabase.from('organization_members').select('user_id, role').eq('org_id', orgId),
    supabase.from('subscriptions').select('plan, status, trial_end, stripe_customer_id').eq('org_id', orgId).order('created_at', { ascending: false }).limit(1).single(),
  ])

  // Build profile
  const profile: SettingsProfile = {
    name: profileRes.data?.full_name ?? user.email?.split('@')[0] ?? '',
    email: user.email ?? '',
    businessName: bpRes.data?.business_name ?? '',
    phone: bpRes.data?.phone ?? profileRes.data?.phone ?? '',
  }

  // Build team members
  const memberRows = membersRes.data ?? []
  const memberUserIds = memberRows.map(m => m.user_id)

  let team: SettingsTeamMember[] = []
  if (memberUserIds.length > 0) {
    // Fetch profiles for all team members
    const { data: memberProfiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', memberUserIds)

    team = memberRows.map(m => {
      const memberProfile = memberProfiles?.find(p => p.id === m.user_id)
      return {
        id: m.user_id,
        name: memberProfile?.full_name ?? 'Team Member',
        email: m.user_id === user.id ? (user.email ?? '') : '',
        role: m.role ?? 'viewer',
        avatar: '',
      }
    })
  }

  // Build plan
  const sub = subscriptionRes.data
  const planName = sub?.plan ?? 'Starter'
  const plan: SettingsPlan = {
    name: planName,
    price: PLAN_PRICES[planName] ?? '$49',
    interval: 'month',
    features: PLAN_FEATURES[planName] ?? PLAN_FEATURES.Starter,
    usagePercent: 0, // TODO: calculate from actual usage
    card: sub?.stripe_customer_id ? '•••• •••• •••• ••••' : 'No card on file',
    cardExpiry: sub?.trial_end
      ? `Trial ends ${new Date(sub.trial_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      : '',
  }

  const data: SettingsPageData = { profile, team, plan }

  return <SettingsPage data={data} />
}
