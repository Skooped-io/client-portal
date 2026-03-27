'use client'

import { useEffect, useCallback, useState } from 'react'
import type { DriveStep } from 'driver.js'

const TOUR_KEY = 'skooped-dashboard-tour-v1'

export function useDashboardTour(isReady: boolean = true) {
  const [showMobileWelcome, setShowMobileWelcome] = useState(false)

  const startTour = useCallback(async () => {
    // On mobile, show welcome card instead of driver.js overlay
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setShowMobileWelcome(true)
      return
    }
    // Dynamic import so driver.js only loads client-side
    const { driver } = await import('driver.js')

    const steps: DriveStep[] = [
      // Step 1 — Welcome (centered, no element)
      {
        popover: {
          title: '👋 Welcome to your dashboard',
          description: `
            <p>This is your Skooped command center. Everything your business needs to grow online — SEO, ads, content, and reporting — all in one place.</p>
            <p style="margin-top:8px; opacity:0.6; font-size:12px;">This tour takes about 60 seconds.</p>
          `,
          align: 'center',
        },
      },
      // Step 2 — Metrics
      {
        element: '#dashboard-metrics',
        popover: {
          title: '📊 Your Key Metrics',
          description: 'Your most important numbers at a glance — leads, traffic, Google rankings, and ad ROI. Once your Google account is connected, you\'ll see live data here.',
          side: 'bottom',
          align: 'start',
        },
      },
      // Step 3 — Charts
      {
        element: '#dashboard-chart-section',
        popover: {
          title: '📈 Traffic & Impressions',
          description: 'Track your website visitors and Google Search impressions over the last 30 days. See the trend lines move as we grow your online presence.',
          side: 'top',
          align: 'start',
        },
      },
      // Step 4 — Content Calendar
      {
        element: '#content-calendar',
        popover: {
          title: '📅 Content Calendar',
          description: 'See what\'s scheduled across your Instagram, Facebook, and Google Business posts for the next 7 days. Sierra keeps your feed fresh.',
          side: 'top',
          align: 'start',
        },
      },
      // Step 5 — Activity Feed
      {
        element: '#agent-activity',
        popover: {
          title: '🤖 Agent Activity',
          description: 'Watch your AI team work in real-time. Every action Scout, Sierra, Riley, and the crew take shows up here with status and details.',
          side: 'top',
          align: 'start',
        },
      },
      // Step 6 — Command Palette
      {
        element: '#command-palette-trigger',
        popover: {
          title: '⌘ Command Palette',
          description: 'Hit ⌘K (or Ctrl+K on Windows) anywhere to quickly navigate, search, or trigger actions without lifting your hands from the keyboard.',
          side: 'bottom',
          align: 'end',
        },
      },
      // Step 7 — Done
      {
        popover: {
          title: "You're all set! 🎉",
          description: `
            <p>Your dashboard is live. Start by connecting your Google account in Settings and we'll get to work.</p>
            <p style="margin-top:8px; opacity:0.6; font-size:12px;">You can replay this tour anytime from the Help menu.</p>
          `,
          align: 'center',
        },
      },
    ]

    const driverObj = driver({
      showProgress: true,
      animate: true,
      overlayColor: 'rgba(0, 0, 0, 0.72)',
      popoverClass: 'skooped-tour-popover',
      progressText: '{{current}} of {{total}}',
      nextBtnText: 'Next →',
      prevBtnText: '← Back',
      doneBtnText: "Let's go! 🚀",
      steps,
      onDestroyStarted: () => {
        localStorage.setItem(TOUR_KEY, 'completed')
        driverObj.destroy()
      },
    })

    driverObj.drive()
  }, [])

  // Auto-start only on first visit, AFTER isReady is true
  useEffect(() => {
    if (!isReady) return
    const tourStatus = localStorage.getItem(TOUR_KEY)
    if (!tourStatus) {
      const timer = setTimeout(() => startTour(), 1800)
      return () => clearTimeout(timer)
    }
  }, [startTour, isReady])

  const dismissMobileWelcome = useCallback(() => {
    localStorage.setItem(TOUR_KEY, 'completed')
    setShowMobileWelcome(false)
  }, [])

  const resetTour = useCallback(() => {
    localStorage.removeItem(TOUR_KEY)
    startTour()
  }, [startTour])

  return { startTour, resetTour, showMobileWelcome, dismissMobileWelcome }
}
