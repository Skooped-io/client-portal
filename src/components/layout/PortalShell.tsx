'use client'

import { useState } from 'react'
import { TopBar } from './TopBar'
import { CommandPalette } from './CommandPalette'

interface PortalShellProps {
  clientName: string
  businessName?: string
  children: React.ReactNode
}

/**
 * Client component shell that manages command palette state.
 * Wraps TopBar + CommandPalette + main content.
 * Keeps the portal layout server-rendered except for interactivity.
 */
export function PortalShell({ clientName, businessName, children }: PortalShellProps) {
  const [cmdOpen, setCmdOpen] = useState(false)

  return (
    <>
      <TopBar
        clientName={clientName}
        businessName={businessName}
        onCommandPaletteOpen={() => setCmdOpen(true)}
      />
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
      {children}
    </>
  )
}
