'use client'

import { useState, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { formatDistanceToNow } from 'date-fns'
import { CheckCheck, ChevronDown, ChevronUp, Activity } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { stagger, slideUp } from '@/lib/animations/variants'
import {
  type BotActivity,
  type AgentId,
  type ActionType,
  AGENT_CONFIG,
  ACTION_CONFIG,
  DEMO_BOT_ACTIVITIES,
} from '@/lib/activity-demo-data'

// ===== Filter options =====

const AGENT_FILTERS: Array<{ value: 'all' | AgentId; label: string }> = [
  { value: 'all', label: 'All agents' },
  { value: 'scout', label: 'Scout' },
  { value: 'sierra', label: 'Sierra' },
  { value: 'riley', label: 'Riley' },
  { value: 'bob', label: 'Bob' },
  { value: 'cooper', label: 'Cooper' },
]

const TYPE_FILTERS: Array<{ value: 'all' | ActionType; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'seo_scan', label: '🔍 SEO' },
  { value: 'analytics_report', label: '📊 Analytics' },
  { value: 'social_scheduled', label: '📱 Social' },
  { value: 'website_health', label: '🌐 Website' },
  { value: 'review_detected', label: '⭐ Reviews' },
  { value: 'keyword_improved', label: '📈 Keywords' },
  { value: 'website_deployed', label: '🔧 Deploy' },
  { value: 'team_message', label: '💬 Messages' },
]

// ===== Activity row =====

interface ActivityRowProps {
  activity: BotActivity
  isUnread: boolean
  onRead: (id: string) => void
}

function ActivityRow({ activity, isUnread, onRead }: ActivityRowProps) {
  const [expanded, setExpanded] = useState(false)
  const agent = AGENT_CONFIG[activity.agent]
  const action = ACTION_CONFIG[activity.action_type]
  const timeAgo = formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })

  function onToggle() {
    setExpanded((e) => !e)
    if (isUnread) onRead(activity.id)
  }

  return (
    <motion.div
      variants={slideUp}
      className={cn(
        'relative flex gap-3 p-4 rounded-xl border transition-all duration-200 cursor-pointer',
        'bg-card/50 border-border hover:bg-card',
      )}
      onClick={onToggle}
    >
      {/* Unread dot */}
      {isUnread && (
        <span className="absolute top-3.5 right-3.5 w-2 h-2 rounded-full bg-strawberry" aria-label="Unread" />
      )}

      {/* Agent avatar */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 border mt-0.5"
        style={{
          color: agent.color,
          backgroundColor: agent.bg,
          borderColor: `${agent.color}30`,
        }}
      >
        {agent.initials}
      </div>

      <div className="flex-1 min-w-0 pr-4">
        {/* Row header */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-foreground">{agent.name}</span>
          <span className="text-[10px] text-muted-foreground/60">·</span>
          <span className="text-[10px] text-muted-foreground/70">{action.icon} {action.label}</span>
          <span className="ml-auto text-[10px] text-muted-foreground/60 whitespace-nowrap shrink-0">{timeAgo}</span>
        </div>

        {/* Title */}
        <p className="text-xs font-medium text-foreground mt-0.5 leading-snug">{activity.title}</p>

        {/* Expanded detail */}
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2.5 p-3 rounded-lg bg-muted/40 border border-border">
              <p className="text-xs text-muted-foreground leading-relaxed">{activity.description}</p>
              {activity.metadata && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {Object.entries(activity.metadata).map(([k, v]) => (
                    <span
                      key={k}
                      className="text-[10px] bg-background/60 px-2 py-0.5 rounded-md border border-border text-muted-foreground"
                    >
                      {k.replace(/_/g, ' ')}:{' '}
                      <span className="text-foreground font-medium">{String(v)}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? 'Less' : 'Details'}
        </button>
      </div>
    </motion.div>
  )
}

// ===== Filter pill =====

interface FilterPillProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

function FilterPill({ active, onClick, children }: FilterPillProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-150 whitespace-nowrap border',
        active
          ? 'bg-strawberry/10 border-strawberry/30 text-strawberry'
          : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-card-hover',
      )}
    >
      {children}
    </button>
  )
}

// ===== Page =====

export default function ActivityPage() {
  const [agentFilter, setAgentFilter] = useState<'all' | AgentId>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | ActionType>('all')
  const [readIds, setReadIds] = useState<Set<string>>(
    () => new Set(DEMO_BOT_ACTIVITIES.filter((a) => a.read).map((a) => a.id)),
  )

  const filtered = useMemo(() => {
    return DEMO_BOT_ACTIVITIES.filter((a) => {
      if (agentFilter !== 'all' && a.agent !== agentFilter) return false
      if (typeFilter !== 'all' && a.action_type !== typeFilter) return false
      return true
    })
  }, [agentFilter, typeFilter])

  const unreadCount = filtered.filter((a) => !readIds.has(a.id)).length

  const onRead = useCallback((id: string) => {
    setReadIds((prev) => new Set([...prev, id]))
  }, [])

  const onMarkAllRead = useCallback(() => {
    setReadIds(new Set(DEMO_BOT_ACTIVITIES.map((a) => a.id)))
  }, [])

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">

      {/* Page header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-nunito font-bold text-foreground flex items-center gap-2">
            <Activity className="w-5 h-5 text-strawberry" />
            Activity log
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Everything your Skooped AI team has done for your business
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onMarkAllRead}
            className="text-xs text-muted-foreground hover:text-foreground gap-1.5 rounded-xl shrink-0 mt-1"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card className="bg-card border-border rounded-xl">
        <CardContent className="pt-4 pb-4 space-y-3">
          {/* Agent filter */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-0.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0 w-14">Agent</span>
            <div className="flex items-center gap-1.5 flex-nowrap">
              {AGENT_FILTERS.map((f) => (
                <FilterPill
                  key={f.value}
                  active={agentFilter === f.value}
                  onClick={() => setAgentFilter(f.value as 'all' | AgentId)}
                >
                  {f.label}
                </FilterPill>
              ))}
            </div>
          </div>

          {/* Type filter */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-0.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0 w-14">Type</span>
            <div className="flex items-center gap-1.5 flex-nowrap">
              {TYPE_FILTERS.map((f) => (
                <FilterPill
                  key={f.value}
                  active={typeFilter === f.value}
                  onClick={() => setTypeFilter(f.value as 'all' | ActionType)}
                >
                  {f.label}
                </FilterPill>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card className="bg-card border-border rounded-xl overflow-hidden">
        <CardHeader className="pb-3 relative">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-strawberry via-mint to-blueberry opacity-60" />
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-nunito font-semibold">
              {filtered.length} {filtered.length === 1 ? 'event' : 'events'}
            </CardTitle>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-strawberry/15 border border-strawberry/25 text-strawberry">
                {unreadCount} unread
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-4 bg-vanilla/20 rounded-full mb-4">
                <Activity className="w-8 h-8 text-gold" />
              </div>
              <h3 className="font-nunito font-semibold text-foreground mb-2">No activity yet</h3>
              <p className="text-muted-foreground text-sm max-w-sm">
                Try changing your filters, or check back soon — your team is working on it.
              </p>
            </div>
          ) : (
            <motion.div
              className="space-y-2"
              variants={stagger}
              initial="hidden"
              animate="visible"
            >
              {filtered.map((activity) => (
                <ActivityRow
                  key={activity.id}
                  activity={activity}
                  isUnread={!readIds.has(activity.id)}
                  onRead={onRead}
                />
              ))}
            </motion.div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
