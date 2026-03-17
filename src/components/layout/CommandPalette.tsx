'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  BarChart3,
  Search,
  Instagram,
  Megaphone,
  Globe,
  FileText,
  Settings,
  Users,
  MessageSquare,
  ArrowRight,
  Hash,
  Pencil,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { commandPaletteOverlay, commandPaletteModal } from '@/lib/animations/variants'

// ===== Command Registry =====

interface CommandItem {
  id: string
  label: string
  description?: string
  icon: React.ElementType
  action: string
  type: 'navigate' | 'action'
  keywords?: string[]
}

const COMMANDS: CommandItem[] = [
  {
    id: 'nav-dashboard',
    label: 'Dashboard',
    description: 'Your main performance overview',
    icon: LayoutDashboard,
    action: '/dashboard',
    type: 'navigate',
    keywords: ['home', 'overview', 'main'],
  },
  {
    id: 'nav-analytics',
    label: 'Analytics',
    description: 'Traffic, conversions, and trends',
    icon: BarChart3,
    action: '/analytics',
    type: 'navigate',
    keywords: ['charts', 'traffic', 'stats'],
  },
  {
    id: 'nav-seo',
    label: 'SEO & Rankings',
    description: 'Keyword positions and search performance',
    icon: Search,
    action: '/seo',
    type: 'navigate',
    keywords: ['keywords', 'google', 'search', 'rankings', 'impressions', 'gbp'],
  },
  {
    id: 'nav-ads',
    label: 'Ads & Leads',
    description: 'Campaign performance and lead pipeline',
    icon: Megaphone,
    action: '/ads',
    type: 'navigate',
    keywords: ['google ads', 'lsa', 'campaigns', 'leads', 'cost per lead', 'budget'],
  },
  {
    id: 'nav-content',
    label: 'Content & Social',
    description: 'Content calendar, posts, and engagement',
    icon: Pencil,
    action: '/content',
    type: 'navigate',
    keywords: ['instagram', 'facebook', 'content', 'posts', 'calendar', 'social', 'schedule', 'engagement'],
  },
  {
    id: 'nav-social',
    label: 'Social Media',
    description: 'Content calendar and post performance',
    icon: Instagram,
    action: '/social',
    type: 'navigate',
    keywords: ['instagram', 'facebook', 'content', 'posts'],
  },
  {
    id: 'nav-website',
    label: 'Website',
    description: 'Your site status and performance',
    icon: Globe,
    action: '/website',
    type: 'navigate',
    keywords: ['site', 'web', 'pages'],
  },
  {
    id: 'nav-reports',
    label: 'Reports',
    description: 'Monthly performance reports',
    icon: FileText,
    action: '/reports',
    type: 'navigate',
    keywords: ['monthly', 'pdf', 'download'],
  },
  {
    id: 'nav-team',
    label: 'Agent Team',
    description: 'Your AI team and their activity',
    icon: Users,
    action: '/team',
    type: 'navigate',
    keywords: ['agents', 'cooper', 'scout', 'sierra', 'riley'],
  },
  {
    id: 'nav-messages',
    label: 'Messages',
    description: 'Inbox and communications',
    icon: MessageSquare,
    action: '/messages',
    type: 'navigate',
    keywords: ['inbox', 'chat', 'communicate'],
  },
  {
    id: 'nav-settings',
    label: 'Settings',
    description: 'Account and preferences',
    icon: Settings,
    action: '/settings',
    type: 'navigate',
    keywords: ['account', 'profile', 'preferences', 'billing'],
  },
]

// ===== Keyboard shortcut hook =====

function useCommandPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  return { open, setOpen }
}

// ===== Command Item component =====

interface CommandItemProps {
  item: CommandItem
  onSelect: (item: CommandItem) => void
}

function CommandRow({ item, onSelect }: CommandItemProps) {
  const Icon = item.icon

  return (
    <Command.Item
      value={`${item.label} ${item.keywords?.join(' ') ?? ''}`}
      onSelect={() => onSelect(item)}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg mx-1 cursor-pointer',
        'text-foreground transition-colors duration-100',
        'data-[selected=true]:bg-strawberry/10 data-[selected=true]:text-strawberry',
        'hover:bg-card',
        'outline-none',
      )}
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted shrink-0">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-sm font-medium leading-tight">{item.label}</span>
        {item.description && (
          <span className="text-xs text-muted-foreground truncate">{item.description}</span>
        )}
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-data-[selected=true]:opacity-100 transition-opacity" />
    </Command.Item>
  )
}

// ===== Main Command Palette =====

interface CommandPaletteProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function CommandPalette({ open: controlledOpen, onOpenChange }: CommandPaletteProps) {
  const router = useRouter()
  const { open: uncontrolledOpen, setOpen } = useCommandPalette()

  const isOpen = controlledOpen ?? uncontrolledOpen
  const handleOpenChange = useCallback(
    (value: boolean) => {
      setOpen(value)
      onOpenChange?.(value)
    },
    [setOpen, onOpenChange],
  )

  const handleSelect = useCallback(
    (item: CommandItem) => {
      handleOpenChange(false)
      if (item.type === 'navigate') {
        router.push(item.action)
      }
    },
    [handleOpenChange, router],
  )

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            variants={commandPaletteOverlay}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm"
            onClick={() => handleOpenChange(false)}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            variants={commandPaletteModal}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed left-1/2 top-[20vh] z-50 w-full max-w-lg -translate-x-1/2"
          >
            <Command
              className="rounded-xl border border-border bg-background shadow-2xl overflow-hidden"
              loop
            >
              {/* Search input */}
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <Hash className="w-4 h-4 text-muted-foreground shrink-0" />
                <Command.Input
                  placeholder="Search pages and actions..."
                  className={cn(
                    'flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground',
                    'outline-none border-0 ring-0',
                  )}
                  autoFocus
                />
                <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-80 sm:flex">
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <Command.List className="max-h-72 overflow-y-auto py-2 scrollbar-thin">
                <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
                  No results found.
                </Command.Empty>

                <Command.Group
                  heading={
                    <span className="px-4 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider block">
                      Navigate
                    </span>
                  }
                >
                  {COMMANDS.filter((c) => c.type === 'navigate').map((item) => (
                    <CommandRow key={item.id} item={item} onSelect={handleSelect} />
                  ))}
                </Command.Group>
              </Command.List>

              {/* Footer */}
              <div className="flex items-center gap-3 border-t border-border px-4 py-2">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">↑↓</kbd>
                  <span>navigate</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">↵</kbd>
                  <span>open</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground ml-auto">
                  <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">⌘K</kbd>
                  <span>toggle</span>
                </div>
              </div>
            </Command>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ===== Hook export for external control =====
export { useCommandPalette }
