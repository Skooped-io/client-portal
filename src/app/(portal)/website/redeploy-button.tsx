'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export function RedeployButton() {
  const [isDeploying, setIsDeploying] = useState(false)

  async function handleRedeploy() {
    if (isDeploying) return
    setIsDeploying(true)

    try {
      const res = await fetch('/api/deploy/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (res.ok) {
        toast.success('Re-deploy triggered! Your site will update in ~60 seconds.')
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Failed to trigger re-deploy. Try again.')
      }
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setTimeout(() => setIsDeploying(false), 5000) // prevent double-clicks
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleRedeploy}
      disabled={isDeploying}
      className="gap-2 text-xs shrink-0"
    >
      <RefreshCw className={`w-3.5 h-3.5 ${isDeploying ? 'animate-spin' : ''}`} />
      {isDeploying ? 'Deploying...' : 'Update Site'}
    </Button>
  )
}
