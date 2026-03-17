'use client'

import { useState } from 'react'
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
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { logoutAction } from '@/app/(portal)/actions'
import { cn } from '@/lib/utils'
import { getInitials } from '@/lib/utils'
import { sidebarLabelVariants, avatarBreathe } from '@/lib/animations/variants'

// ===== Navigation Items =====

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Analytics', href: '/analytics', icon: BarChart3 },
  { label: 'SEO', href: '/seo', icon: Search },
  { label: 'Social', href: '/social', icon: Instagram },
  { label: 'Ads', href: '/ads', icon: Megaphone },
  { label: 'Website', href: '/website', icon: Globe },
  { label: 'Reports', href: '/reports', icon: FileText },
  { label: 'Team', href: '/team', icon: Users },
  { label: 'Messages', href: '/messages', icon: MessageSquare },
  { label: 'Settings', href: '/settings', icon: Settings },
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
    <Link href={item.href} className={itemClass}>
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
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">
          Your Team
        </p>
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
          <div className="w-8 h-8 rounded-lg bg-strawberry flex items-center justify-center shrink-0 shadow-sm">
            <span className="text-white font-nunito font-bold text-sm">S</span>
          </div>
          <AnimatePresence initial={false}>
            {!isCollapsed && (
              <motion.span
                variants={sidebarLabelVariants}
                initial="collapsed"
                animate="expanded"
                exit="collapsed"
                className="font-nunito font-bold text-foreground text-base overflow-hidden whitespace-nowrap"
              >
                Skooped
              </motion.span>
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

export function Sidebar({ userName, userEmail }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  return (
    <>
      {/* Mobile hamburger trigger */}
      <div className="fixed top-4 left-4 z-40 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsMobileOpen(true)}
          className="h-9 w-9 bg-background border border-border shadow-sm rounded-xl"
        >
          <Menu className="w-5 h-5" />
          <span className="sr-only">Open menu</span>
        </Button>
      </div>

      {/* Mobile sheet sidebar */}
      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetContent side="left" className="p-0 w-64 border-0">
          <button
            onClick={() => setIsMobileOpen(false)}
            className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring z-10"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
          <SidebarContent
            userName={userName}
            userEmail={userEmail}
            isCollapsed={false}
            showToggle={false}
          />
        </SheetContent>
      </Sheet>

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
