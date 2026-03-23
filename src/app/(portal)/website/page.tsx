import type { Metadata } from 'next'
import { Globe, ExternalLink, Clock, CheckCircle2, AlertCircle, RefreshCw, Settings } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'

export const metadata: Metadata = {
  title: 'Website',
}

export const revalidate = 300

const STATUS_CONFIG = {
  live: { label: 'Live', color: 'bg-emerald-500', icon: CheckCircle2, badgeClass: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  building: { label: 'Building', color: 'bg-amber-500', icon: RefreshCw, badgeClass: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  pending: { label: 'Pending', color: 'bg-blue-500', icon: Clock, badgeClass: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  failed: { label: 'Failed', color: 'bg-red-500', icon: AlertCircle, badgeClass: 'bg-red-500/10 text-red-600 border-red-500/20' },
} as const

type DeployStatus = keyof typeof STATUS_CONFIG

export default async function WebsitePage() {
  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)

  let deployment = null
  let businessProfile = null
  let deployHistory: Array<{
    id: string
    status: string
    template: string | null
    site_url: string | null
    deployed_at: string | null
    created_at: string
  }> = []

  if (orgId) {
    const [deployRes, profileRes, historyRes] = await Promise.all([
      supabase
        .from('site_deployments')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from('business_profiles')
        .select('business_name, phone, city, state, industry, services, template')
        .eq('org_id', orgId)
        .single(),
      supabase
        .from('site_deployments')
        .select('id, status, template, site_url, deployed_at, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    deployment = deployRes.data
    businessProfile = profileRes.data
    deployHistory = historyRes.data ?? []
  }

  const hasDeployment = !!deployment
  const status = (deployment?.status ?? 'pending') as DeployStatus
  const statusConfig = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
  const StatusIcon = statusConfig.icon

  if (!hasDeployment) {
    return (
      <div className="px-4 py-6 md:px-6 md:py-8 lg:px-8 max-w-7xl mx-auto space-y-4 md:space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-nunito font-bold text-foreground">Website</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitor your website health, manage content, and track deployments.
          </p>
        </div>

        <EmptyState
          icon={Globe}
          title={businessProfile?.template === 'custom-cooper'
            ? "Your custom website is being built"
            : "Your website is being prepared"
          }
          description={businessProfile?.template === 'custom-cooper'
            ? "Cooper and Jake are working on your custom site. You'll get an email when it's ready!"
            : "Your website will be deployed automatically after your subscription starts. Check back soon!"
          }
        />
      </div>
    )
  }

  return (
    <div className="px-4 py-6 md:px-6 md:py-8 lg:px-8 max-w-7xl mx-auto space-y-4 md:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-nunito font-bold text-foreground">Website</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitor your website health, manage content, and track deployments.
          </p>
        </div>
      </div>

      {/* Site Overview Card */}
      <Card className="bg-card border-border rounded-xl overflow-hidden">
        <CardHeader className="pb-3 relative">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-strawberry via-mint to-blueberry opacity-70" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-strawberry" />
              <CardTitle className="text-sm font-nunito font-semibold">Your Website</CardTitle>
            </div>
            <Badge variant="outline" className={`text-xs ${statusConfig.badgeClass}`}>
              <StatusIcon className="w-3 h-3 mr-1" />
              {statusConfig.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* URL Display */}
          {deployment.site_url && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center gap-2 min-w-0">
                <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-mono text-foreground truncate">
                  {deployment.site_url.replace('https://', '')}
                </span>
              </div>
              <a
                href={deployment.site_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-strawberry hover:bg-strawberry/10">
                  Visit Site
                  <ExternalLink className="w-3 h-3" />
                </Button>
              </a>
            </div>
          )}

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
              <p className="text-xs text-muted-foreground">Template</p>
              <p className="text-sm font-medium text-foreground mt-0.5">{deployment.template ?? 'Custom'}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
              <p className="text-xs text-muted-foreground">Deployed</p>
              <p className="text-sm font-medium text-foreground mt-0.5">
                {deployment.deployed_at
                  ? new Date(deployment.deployed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : 'Pending'}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
              <p className="text-xs text-muted-foreground">Industry</p>
              <p className="text-sm font-medium text-foreground mt-0.5">{businessProfile?.industry ?? '—'}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
              <p className="text-xs text-muted-foreground">Location</p>
              <p className="text-sm font-medium text-foreground mt-0.5">
                {[businessProfile?.city, businessProfile?.state].filter(Boolean).join(', ') || '—'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Business Info Card */}
      <Card className="bg-card border-border rounded-xl overflow-hidden">
        <CardHeader className="pb-3 relative">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-gold via-vanilla-500 to-gold opacity-70" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-[#C99035]" />
              <CardTitle className="text-sm font-nunito font-semibold">Business Info on Your Site</CardTitle>
            </div>
            <Link href="/settings">
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1 h-7">
                Edit in Settings
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Business Name</p>
              <p className="text-sm text-foreground">{businessProfile?.business_name ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Phone</p>
              <p className="text-sm text-foreground">{businessProfile?.phone ?? '—'}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground">Services</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {(businessProfile?.services ?? []).map((service: string) => (
                  <Badge key={service} variant="outline" className="text-xs bg-muted/50">
                    {service}
                  </Badge>
                ))}
                {(!businessProfile?.services || businessProfile.services.length === 0) && (
                  <span className="text-sm text-muted-foreground">No services listed</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Deployment History */}
      {deployHistory.length > 1 && (
        <Card className="bg-card border-border rounded-xl overflow-hidden">
          <CardHeader className="pb-3 relative">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blueberry via-strawberry to-mint opacity-60" />
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blueberry" />
              <CardTitle className="text-sm font-nunito font-semibold">Deployment History</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {deployHistory.map((deploy) => {
                const dStatus = (deploy.status ?? 'pending') as DeployStatus
                const dConfig = STATUS_CONFIG[dStatus] ?? STATUS_CONFIG.pending
                return (
                  <div key={deploy.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-muted/20">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${dConfig.color}`} />
                      <span className="text-sm text-foreground">{deploy.template ?? 'Custom'}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {deploy.deployed_at
                        ? new Date(deploy.deployed_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        : 'Pending'}
                    </span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
