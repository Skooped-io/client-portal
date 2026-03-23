'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  BarChart3,
  Search,
  Instagram,
  Megaphone,
  Globe,
  MessageSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  X,
  Users,
  FileText,
  Pencil,
  Activity,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { logoutAction } from '@/app/(portal)/actions'
import { cn } from '@/lib/utils'
import { getInitials } from '@/lib/utils'
import { sidebarLabelVariants, avatarBreathe } from '@/lib/animations/variants'

// ===== Scoop icon for sidebar header accent =====

function ScoopAccent() {
  return (
    <svg width="18" height="20" viewBox="0 0 18 20" fill="none" aria-hidden="true" className="shrink-0">
      <ellipse cx="9" cy="8" rx="7" ry="6.5" fill="#D94A7A" opacity={0.85} />
      <ellipse cx="7" cy="5.5" rx="2.5" ry="1.8" fill="white" opacity={0.35} />
      {/* cone */}
      <polygon points="3,13 15,13 9,20" fill="#C99035" />
      <line x1="4" y1="15" x2="14" y2="15" stroke="#A07820" strokeWidth="0.8" opacity={0.5} />
      <line x1="5.5" y1="17.5" x2="12.5" y2="17.5" stroke="#A07820" strokeWidth="0.8" opacity={0.5} />
    </svg>
  )
}

// ===== Navigation Items =====

const navItems = [
  { label: 'Dashboard',      href: '/dashboard', icon: LayoutDashboard, tourId: 'tour-nav-dashboard' },
  { label: 'Analytics',      href: '/analytics', icon: BarChart3,        tourId: 'tour-nav-analytics' },
  { label: 'SEO & Rankings', href: '/seo',       icon: Search,           tourId: 'tour-nav-seo' },
  { label: 'Ads & Leads',    href: '/ads',       icon: Megaphone,        tourId: 'tour-nav-ads' },
  { label: 'Content & Social', href: '/content', icon: Pencil,           tourId: undefined },
  { label: 'Social',         href: '/social',    icon: Instagram,        tourId: 'tour-nav-social' },
  { label: 'Website',        href: '/website',   icon: Globe,            tourId: undefined },
  { label: 'Activity',       href: '/activity',  icon: Activity,         tourId: undefined },
  { label: 'Reports',        href: '/reports',   icon: FileText,         tourId: undefined },
  { label: 'Team',           href: '/team',      icon: Users,            tourId: undefined },
  { label: 'Messages',       href: '/messages',  icon: MessageSquare,    tourId: 'tour-nav-messages' },
  { label: 'Settings',       href: '/settings',  icon: Settings,         tourId: undefined },
]

// ===== Agent definitions — shown at bottom of sidebar as avatars =====

interface AgentConfig {
  id: string
  name: string
  role: string
  color: string
  initials: string
  /** Path to avatar image (public dir) */
  avatar?: string
}

const agents: AgentConfig[] = [
  {
    id: 'cooper',
    name: 'Cooper',
    role: 'Orchestrator',
    color: '#D94A7A',
    initials: 'CO',
    avatar: '/agents/cooper.png',
  },
  {
    id: 'scout',
    name: 'Scout',
    role: 'SEO & Ads',
    color: '#5B8DEF',
    initials: 'SC',
    avatar: '/agents/scout.png',
  },
  {
    id: 'sierra',
    name: 'Sierra',
    role: 'Social Media',
    color: '#C99035',
    initials: 'SI',
    avatar: '/agents/sierra.png',
  },
  {
    id: 'riley',
    name: 'Riley',
    role: 'Reports',
    color: '#4CAF50',
    initials: 'RI',
    avatar: '/agents/riley.png',
  },
  {
    id: 'bob',
    name: 'Bob',
    role: 'Builder',
    color: '#6E3D20',
    initials: 'BO',
    avatar: '/agents/bob.png',
  },
]

// ===== Sub-components =====

interface NavItemProps {
  item: (typeof navItems)[0]
  isActive: boolean
  isCollapsed: boolean
}

function NavItem({ item, isActive, isCollapsed }: NavItemProps) {
  const Icon = item.icon

  const itemClass = cn(
    'relative flex items-center gap-3 rounded-xl transition-colors group',
    isCollapsed ? 'w-10 h-10 justify-center' : 'px-3 py-2',
    isActive
      ? 'bg-strawberry/10 text-strawberry'
      : 'text-muted-foreground hover:text-foreground hover:bg-card dark:hover:bg-card',
  )

  const content = (
    <Link
      href={item.href}
      className={itemClass}
      {...(item.tourId ? { 'data-tour-id': item.tourId } : {})}
    >
      {isActive && (
        <motion.div
          layoutId="nav-active-pill"
          className="absolute inset-0 rounded-xl bg-strawberry/10"
          transition={{ duration: 0.2, ease: 'easeInOut' }}
        />
      )}
      <Icon className="w-5 h-5 shrink-0 relative z-10" />
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.span
            variants={sidebarLabelVariants}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            className="text-sm font-medium overflow-hidden whitespace-nowrap relative z-10"
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
      {isActive && !isCollapsed && (
        <motion.div
          layoutId="nav-active-dot"
          className="absolute right-3 w-1.5 h-1.5 rounded-full bg-strawberry"
        />
      )}
    </Link>
  )

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {item.label}
        </TooltipContent>
      </Tooltip>
    )
  }

  return content
}

// ===== Agent Avatar Strip =====

function AgentAvatarStrip({ isCollapsed }: { isCollapsed: boolean }) {
  return (
    <div
      className={cn(
        'border-t border-border pt-3 pb-1',
        isCollapsed ? 'px-3' : 'px-4',
      )}
    >
      {!isCollapsed && (
        <div className="flex items-center gap-1.5 mb-2 px-1">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Your AI Team</span>
          {/* Live indicator */}
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
        </div>
      )}
      <div className={cn('flex', isCollapsed ? 'flex-col gap-2 items-center' : 'flex-wrap gap-1.5')}>
        {agents.map((agent) => (
          <Tooltip key={agent.id}>
            <TooltipTrigger asChild>
              <motion.div
                variants={avatarBreathe}
                animate="animate"
                style={{ animationDelay: `${agents.indexOf(agent) * 0.6}s` }}
                className="cursor-pointer"
              >
                <Avatar
                  className={cn(
                    'border-2 ring-0 transition-shadow hover:ring-2 hover:ring-offset-1',
                    isCollapsed ? 'h-8 w-8' : 'h-7 w-7',
                  )}
                  style={{
                    borderColor: agent.color,
                    // @ts-expect-error CSS custom property
                    '--tw-ring-color': agent.color,
                  }}
                >
                  <AvatarImage src={agent.avatar} alt={agent.name} />
                  <AvatarFallback
                    className="text-[9px] font-bold text-white"
                    style={{ backgroundColor: agent.color }}
                  >
                    {agent.initials}
                  </AvatarFallback>
                </Avatar>
              </motion.div>
            </TooltipTrigger>
            <TooltipContent side={isCollapsed ? 'right' : 'top'} className="text-xs">
              <p className="font-medium">{agent.name}</p>
              <p className="text-muted-foreground">{agent.role}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}

// ===== Main Sidebar Content =====

interface SidebarContentProps {
  userName: string
  userEmail: string
  isCollapsed: boolean
  onToggle?: () => void
  showToggle: boolean
}

function SidebarContent({
  userName,
  userEmail,
  isCollapsed,
  onToggle,
  showToggle,
}: SidebarContentProps) {
  const pathname = usePathname()
  const initials = getInitials(userName)

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-[hsl(var(--sidebar-background))] border-r border-[hsl(var(--sidebar-border))] transition-none',
      )}
    >
      {/* ===== Logo Header ===== */}
      <div
        className={cn(
          'flex items-center border-b border-[hsl(var(--sidebar-border))] py-4 shrink-0',
          isCollapsed ? 'justify-center px-3' : 'justify-between px-4',
        )}
      >
        <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-strawberry flex items-center justify-center shrink-0 shadow-strawberry-glow">
            <ScoopAccent />
          </div>
          <AnimatePresence initial={false}>
            {!isCollapsed && (
              <motion.div
                variants={sidebarLabelVariants}
                initial="collapsed"
                animate="expanded"
                exit="collapsed"
                className="overflow-hidden whitespace-nowrap"
              >
                <span className="font-nunito font-bold text-foreground text-base">Skooped</span>
                <span className="block text-[9px] font-medium text-strawberry tracking-wider uppercase opacity-70 -mt-0.5">Client Portal</span>
              </motion.div>
            )}
          </AnimatePresence>
        </Link>

        {showToggle && onToggle && !isCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-card rounded-lg shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="sr-only">Collapse sidebar</span>
          </Button>
        )}
      </div>

      {/* ===== Navigation ===== */}
      <nav className={cn('flex-1 py-4 overflow-y-auto scrollbar-thin', isCollapsed ? 'px-3' : 'px-3')}>
        <TooltipProvider delayDuration={300}>
          <ul className="space-y-0.5">
            {navItems.map((item) => (
              <li key={item.href}>
                <NavItem
                  item={item}
                  isActive={pathname === item.href || pathname.startsWith(item.href + '/')}
                  isCollapsed={isCollapsed}
                />
              </li>
            ))}
          </ul>
        </TooltipProvider>
      </nav>

      {/* ===== Agent Avatars ===== */}
      <TooltipProvider delayDuration={300}>
        <AgentAvatarStrip isCollapsed={isCollapsed} />
      </TooltipProvider>

      {/* ===== User Footer ===== */}
      <div
        className={cn(
          'border-t border-[hsl(var(--sidebar-border))] py-3 shrink-0',
          isCollapsed ? 'px-3' : 'px-3',
        )}
      >
        {isCollapsed ? (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    data-testid="logout-button"
                    className="flex items-center justify-center w-10 h-10 rounded-xl text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
                  >
                    <LogOut className="w-5 h-5" />
                    <span className="sr-only">Sign out</span>
                  </button>
                </form>
              </TooltipTrigger>
              <TooltipContent side="right">Sign out</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="bg-strawberry/10 text-strawberry text-xs font-medium font-nunito">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{userName}</p>
              <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                data-testid="logout-button"
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-card rounded-lg transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
                <span className="sr-only">Sign out</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

// ===== Main Export =====

interface SidebarProps {
  userName: string
  userEmail: string
}

// ===== Mobile Bottom Navigation =====

const mobileNavItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'SEO', href: '/seo', icon: Search },
  { label: 'Ads', href: '/ads', icon: Megaphone },
  { label: 'Content', href: '/content', icon: Pencil },
  { label: 'Team', href: '/team', icon: Users },
]

function MobileBottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-background/90 border-t border-border backdrop-blur-md" aria-label="Mobile navigation">
      <div className="flex items-center justify-around px-0 safe-bottom" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 6px)' }}>
        {mobileNavItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex flex-col items-center gap-0.5 flex-1 py-2 rounded-xl transition-colors min-h-[52px] justify-center',
                isActive
                  ? 'text-strawberry'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="mobile-nav-active"
                  className="absolute inset-0 bg-strawberry/10 rounded-xl"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Icon className="w-5 h-5 relative z-10" aria-hidden="true" />
              <span className="text-xs font-medium relative z-10 leading-tight">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export function Sidebar({ userName, userEmail }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const pathname = usePathname()

  // Auto-close mobile drawer on navigation
  useEffect(() => {
    setIsMobileOpen(false)
  }, [pathname])

  return (
    <>
      {/* Mobile hamburger trigger — shows only when bottom nav doesn't cover the page sufficiently */}
      <div className="fixed top-3 left-3 z-40 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsMobileOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={isMobileOpen}
          className="min-h-[44px] min-w-[44px] bg-background/90 border border-border shadow-sm rounded-xl backdrop-blur-sm"
        >
          <Menu className="w-5 h-5" />
        </Button>
      </div>

      {/* Mobile bottom navigation */}
      <MobileBottomNav />

      {/* Mobile slide-out drawer (full nav) */}
      <AnimatePresence>
        {isMobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="mobile-backdrop"
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileOpen(false)}
            />
            {/* Drawer */}
            <motion.div
              key="mobile-drawer"
              className="fixed left-0 top-0 bottom-0 z-50 w-72 md:hidden shadow-2xl"
              style={{ willChange: 'transform' }}
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
            >
              <button
                onClick={() => setIsMobileOpen(false)}
                aria-label="Close navigation menu"
                className="absolute right-3 top-3 z-10 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-strawberry focus-visible:ring-offset-1"
              >
                <X className="h-4 w-4" />
              </button>
              <SidebarContent
                userName={userName}
                userEmail={userEmail}
                isCollapsed={false}
                showToggle={false}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop sidebar — animated width */}
      <motion.div
        className="hidden md:flex relative shrink-0 h-screen sticky top-0"
        animate={{ width: isCollapsed ? 64 : 240 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
      >
        <SidebarContent
          userName={userName}
          userEmail={userEmail}
          isCollapsed={isCollapsed}
          onToggle={() => setIsCollapsed(!isCollapsed)}
          showToggle
        />

        {/* Expand toggle when collapsed */}
        {isCollapsed && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => setIsCollapsed(false)}
            className="absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground shadow-sm transition-colors"
          >
            <ChevronRight className="w-3 h-3" />
            <span className="sr-only">Expand sidebar</span>
          </motion.button>
        )}
      </motion.div>
    </>
  )
}
