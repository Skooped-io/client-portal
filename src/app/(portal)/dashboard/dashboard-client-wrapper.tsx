'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { LoadingScreen } from './loading-screen'

interface DashboardClientWrapperProps {
  children: React.ReactNode
}

export function DashboardClientWrapper({ children }: DashboardClientWrapperProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showLoading, setShowLoading] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const isCheckout = searchParams.get('checkout') === 'success'
    const isConcierge = searchParams.get('onboarding') === 'concierge'
    if (isCheckout || isConcierge) {
      setShowLoading(true)
    }
    setReady(true)
  }, [searchParams])

  const handleComplete = useCallback(() => {
    // Strip query params and show dashboard
    const url = new URL(window.location.href)
    url.searchParams.delete('checkout')
    url.searchParams.delete('onboarding')
    router.replace(url.pathname + (url.search || ''))
    setShowLoading(false)
  }, [router])

  if (!ready) return null

  if (showLoading) {
    return <LoadingScreen onComplete={handleComplete} />
  }

  return <>{children}</>
}
