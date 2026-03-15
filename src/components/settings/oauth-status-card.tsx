'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, XCircle, AlertCircle, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { OauthStatus } from '@/lib/types'

interface OauthStatusCardProps {
  provider: 'google' | 'meta'
  serviceName: string
  serviceKey: string
  status: OauthStatus | 'disconnected'
  providerEmail?: string | null
  lastSynced?: string | null
  propertyLabel?: string | null
}

function StatusIndicator({ status }: { status: OauthStatus | 'disconnected' }) {
  if (status === 'active') {
    return <CheckCircle2 className="w-4 h-4 text-[#4CAF50]" aria-label="Connected" />
  }
  if (status === 'error' || status === 'revoked') {
    return <AlertCircle className="w-4 h-4 text-[#C99035]" aria-label="Needs reconnection" />
  }
  return <XCircle className="w-4 h-4 text-muted-foreground" aria-label="Not connected" />
}

function StatusBadge({ status }: { status: OauthStatus | 'disconnected' }) {
  if (status === 'active') {
    return (
      <Badge className="bg-[#4CAF50]/10 text-[#4CAF50] border-0 rounded-full text-xs font-dm-sans">
        Connected
      </Badge>
    )
  }
  if (status === 'error' || status === 'revoked') {
    return (
      <Badge className="bg-[#C99035]/10 text-[#C99035] border-0 rounded-full text-xs font-dm-sans">
        Needs Reconnection
      </Badge>
    )
  }
  return (
    <Badge className="bg-muted text-muted-foreground border-0 rounded-full text-xs font-dm-sans">
      Not Connected
    </Badge>
  )
}

export function OauthStatusCard({
  provider,
  serviceName,
  serviceKey,
  status,
  providerEmail,
  lastSynced,
  propertyLabel,
}: OauthStatusCardProps) {
  const [isLoading, setIsLoading] = useState(false)

  async function onDisconnect() {
    if (!confirm(`Disconnect ${serviceName}? This will remove access for all agents.`)) return
    setIsLoading(true)
    try {
      const response = await fetch(`/api/oauth/${provider}/disconnect`, { method: 'POST' })
      if (!response.ok) throw new Error('Failed to disconnect')
      toast.success(`${serviceName} disconnected`)
      window.location.reload()
    } catch (err) {
      console.error({ err })
      toast.error(`Failed to disconnect ${serviceName}`)
    } finally {
      setIsLoading(false)
    }
  }

  function onConnect() {
    window.location.href = `/api/oauth/${provider}/authorize?redirect=/settings`
  }

  const isConnected = status === 'active'
  const needsReconnect = status === 'error' || status === 'revoked'

  return (
    <div
      className="flex items-center justify-between gap-4 py-3"
      data-testid={`oauth-status-card-${serviceKey}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <StatusIndicator status={status} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-dm-sans font-medium text-foreground">{serviceName}</span>
            <StatusBadge status={status} />
          </div>
          {isConnected && providerEmail && (
            <p className="text-xs text-muted-foreground truncate">{providerEmail}</p>
          )}
          {isConnected && propertyLabel && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ExternalLink className="w-3 h-3" />
              {propertyLabel}
            </p>
          )}
          {isConnected && lastSynced && (
            <p className="text-xs text-muted-foreground">
              Last synced {new Date(lastSynced).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      <div className="shrink-0">
        {isConnected ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onDisconnect}
            disabled={isLoading}
            className="border-border text-muted-foreground hover:text-strawberry hover:border-strawberry rounded-xl text-xs"
          >
            {isLoading ? 'Disconnecting...' : 'Disconnect'}
          </Button>
        ) : needsReconnect ? (
          <Button
            size="sm"
            onClick={onConnect}
            disabled={isLoading}
            className="bg-[#C99035] hover:bg-[#C99035]/90 text-white rounded-xl text-xs"
          >
            Reconnect
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={onConnect}
            disabled={isLoading}
            className="bg-strawberry hover:bg-strawberry/90 text-white rounded-xl text-xs"
          >
            Connect
          </Button>
        )}
      </div>
    </div>
  )
}
