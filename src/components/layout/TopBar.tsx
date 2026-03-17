'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Bell, Sun, Moon, Search, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Notification {
  id: string
  title: string
  description: string
  time: string
  read: boolean
}

// Mock notifications — will be replaced by real Supabase data in Phase 2
const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    title: 'Scout updated your keywords',
    description: '3 new keywords added to tracking',
    time: '5m ago',
    read: false,
  },
  {
    id: '2',
    title: 'Monthly report is ready',
    description: 'Your March performance report is available',
    time: '1h ago',
    read: false,
  },
  {
    id: '3',
    title: 'Sierra scheduled 4 posts',
    description: 'Content calendar updated for next week',
    time: '3h ago',
    read: true,
  },
]

// ===== Dark Mode Toggle =====

function DarkModeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch — only render after mount
  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return <div className="w-9 h-9" aria-hidden="true" />
  }

  const isDark = theme === 'dark'

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-card"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <motion.div
        key={theme}
        initial={{ rotate: -30, opacity: 0, scale: 0.8 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        exit={{ rotate: 30, opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {isDark ? (
          <Sun className="h-4.5 w-4.5" />
        ) : (
          <Moon className="h-4.5 w-4.5" />
        )}
      </motion.div>
      <span className="sr-only">{isDark ? 'Light mode' : 'Dark mode'}</span>
    </Button>
  )
}

// ===== Notification Bell =====

function NotificationBell() {
  const unreadCount = MOCK_NOTIFICATIONS.filter((n) => !n.read).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-card"
        >
          <Bell className="h-4.5 w-4.5" />
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-strawberry text-[9px] font-bold text-white"
            >
              {unreadCount}
            </motion.span>
          )}
          <span className="sr-only">Notifications ({unreadCount} unread)</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold font-nunito">Notifications</h3>
          {unreadCount > 0 && (
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0.5 h-auto bg-strawberry/10 text-strawberry border-0"
            >
              {unreadCount} new
            </Badge>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto scrollbar-thin">
          {MOCK_NOTIFICATIONS.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              className={cn(
                'flex flex-col items-start gap-0.5 px-4 py-3 cursor-pointer border-b border-border/50 last:border-0',
                !notification.read && 'bg-strawberry/5',
              )}
            >
              <div className="flex items-center gap-2 w-full">
                {!notification.read && (
                  <span className="w-1.5 h-1.5 rounded-full bg-strawberry shrink-0" />
                )}
                <span className={cn('text-sm font-medium', !notification.read && 'text-foreground')}>
                  {notification.title}
                </span>
              </div>
              <p className="text-xs text-muted-foreground pl-3.5">{notification.description}</p>
              <p className="text-[10px] text-muted-foreground/70 pl-3.5 mt-0.5">{notification.time}</p>
            </DropdownMenuItem>
          ))}
        </div>
        <div className="px-4 py-2.5 border-t border-border">
          <button className="text-xs text-strawberry hover:text-strawberry/80 font-medium transition-colors w-full text-center">
            View all notifications
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ===== Command Palette Trigger =====

interface CommandPaletteTriggerProps {
  onOpen: () => void
}

function CommandPaletteTrigger({ onOpen }: CommandPaletteTriggerProps) {
  return (
    <button
      onClick={onOpen}
      className={cn(
        'hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border',
        'bg-card hover:bg-card-hover text-muted-foreground hover:text-foreground',
        'text-sm transition-colors duration-150',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
      )}
    >
      <Search className="w-3.5 h-3.5" />
      <span>Search...</span>
      <kbd className="ml-2 pointer-events-none hidden h-5 select-none items-center gap-1 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
        <span className="text-xs">⌘</span>K
      </kbd>
    </button>
  )
}

// ===== Client Selector / Name Display =====

interface ClientBadgeProps {
  clientName: string
  businessName?: string
}

function ClientBadge({ clientName, businessName }: ClientBadgeProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-col min-w-0">
        <span className="text-xs text-muted-foreground leading-none mb-0.5">
          {businessName ?? 'Your Business'}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-sm font-semibold font-nunito text-foreground truncate max-w-[160px]">
            {clientName}
          </span>
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        </div>
      </div>
    </div>
  )
}

// ===== Main TopBar =====

interface TopBarProps {
  clientName: string
  businessName?: string
  onCommandPaletteOpen?: () => void
}

export function TopBar({ clientName, businessName, onCommandPaletteOpen }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-4 md:px-6">
      {/* Left: Client name (spacer on mobile for hamburger) */}
      <div className="flex items-center gap-4 flex-1 min-w-0 ml-10 md:ml-0">
        <ClientBadge clientName={clientName} businessName={businessName} />
      </div>

      {/* Center: Search / Command palette trigger */}
      {onCommandPaletteOpen && (
        <div className="flex-1 flex justify-center max-w-xs mx-auto">
          <CommandPaletteTrigger onOpen={onCommandPaletteOpen} />
        </div>
      )}

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        <NotificationBell />
        <DarkModeToggle />
      </div>
    </header>
  )
}
