"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
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
} from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { logoutAction } from "@/app/(portal)/actions"
import { cn } from "@/lib/utils"
import { getInitials } from "@/lib/utils"

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "SEO", href: "/seo", icon: Search },
  { label: "Social", href: "/social", icon: Instagram },
  { label: "Ads", href: "/ads", icon: Megaphone },
  { label: "Website", href: "/website", icon: Globe },
  { label: "Messages", href: "/messages", icon: MessageSquare },
  { label: "Settings", href: "/settings", icon: Settings },
]

interface SidebarProps {
  userName: string
  userEmail: string
}

function NavItem({
  item,
  isActive,
  isCollapsed,
}: {
  item: (typeof navItems)[0]
  isActive: boolean
  isCollapsed: boolean
}) {
  const Icon = item.icon

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={item.href}
            className={cn(
              "flex items-center justify-center w-10 h-10 rounded-xl transition-colors",
              isActive
                ? "bg-strawberry/10 text-strawberry"
                : "text-muted-foreground hover:text-foreground hover:bg-card"
            )}
          >
            <Icon className="w-5 h-5" />
            <span className="sr-only">{item.label}</span>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-xl transition-colors text-sm",
        isActive
          ? "bg-strawberry/10 text-strawberry font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-card"
      )}
    >
      <Icon className="w-5 h-5 shrink-0" />
      <span>{item.label}</span>
    </Link>
  )
}

function SidebarContent({
  userName,
  userEmail,
  isCollapsed,
  onToggle,
  showToggle,
}: {
  userName: string
  userEmail: string
  isCollapsed: boolean
  onToggle?: () => void
  showToggle: boolean
}) {
  const pathname = usePathname()
  const initials = getInitials(userName)

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-background border-r border-border transition-all duration-200",
        isCollapsed ? "w-16" : "w-60"
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center border-b border-border py-4",
          isCollapsed ? "justify-center px-3" : "justify-between px-4"
        )}
      >
        {isCollapsed ? (
          <div className="w-8 h-8 rounded-lg bg-strawberry flex items-center justify-center">
            <span className="text-white font-nunito font-bold text-sm">S</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-strawberry flex items-center justify-center shrink-0">
              <span className="text-white font-nunito font-bold text-sm">S</span>
            </div>
            <span className="font-nunito font-bold text-foreground text-base">Skooped</span>
          </div>
        )}

        {showToggle && onToggle && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className={cn(
              "h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-card rounded-lg",
              isCollapsed && "hidden"
            )}
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="sr-only">Collapse sidebar</span>
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className={cn("flex-1 py-4 overflow-y-auto", isCollapsed ? "px-3" : "px-3")}>
        <TooltipProvider delayDuration={0}>
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.href}>
                <NavItem
                  item={item}
                  isActive={pathname === item.href}
                  isCollapsed={isCollapsed}
                />
              </li>
            ))}
          </ul>
        </TooltipProvider>
      </nav>

      {/* Footer */}
      <div className={cn("border-t border-border py-4", isCollapsed ? "px-3" : "px-3")}>
        {isCollapsed ? (
          <TooltipProvider delayDuration={0}>
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
              <AvatarFallback className="bg-strawberry/10 text-strawberry text-xs font-medium">
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
        <SheetContent side="left" className="p-0 w-60">
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

      {/* Desktop sidebar */}
      <div className="hidden md:flex relative">
        <SidebarContent
          userName={userName}
          userEmail={userEmail}
          isCollapsed={isCollapsed}
          onToggle={() => setIsCollapsed(!isCollapsed)}
          showToggle
        />

        {/* Expand toggle when collapsed */}
        {isCollapsed && (
          <button
            onClick={() => setIsCollapsed(false)}
            className="absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground shadow-sm transition-colors"
          >
            <ChevronRight className="w-3 h-3" />
            <span className="sr-only">Expand sidebar</span>
          </button>
        )}
      </div>
    </>
  )
}
