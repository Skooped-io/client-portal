'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, ArrowRight, CheckCheck } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
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

// Re-export for consumers
export type { BotActivity, AgentId, ActionType }

// ===== Sub-components =====

function AgentAvatar({ agentId }: { agentId: AgentId }) {
  const agent = AGENT_CONFIG[agentId]
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 border"
      style={{
        color: agent.color,
        backgroundColor: agent.bg,
        borderColor: `${agent.color}30`,
      }}
    >
      {agent.initials}
    </div>
  )
}

interface ActivityCardProps {
  activity: BotActivity
  isUnread: boolean
  onRead: (id: string) => void
}

function ActivityCard({ activity, isUnread, onRead }: ActivityCardProps) {
  const [expanded, setExpanded] = useState(false)
  const agent = AGENT_CONFIG[activity.agent]
  const action = ACTION_CONFIG[activity.action_type]
  const timeAgo = formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })

  function onToggleExpand() {
    setExpanded((e) => !e)
    if (isUnread) onRead(activity.id)
  }

  return (
    <motion.div
      variants={slideUp}
      className={cn(
        'group relative flex gap-3 p-4 rounded-xl border transition-all duration-200',
        'bg-card/50 border-border hover:bg-card hover:border-border/80',
        'cursor-pointer',
      )}
      onClick={onToggleExpand}
    >
      {/* Unread indicator */}
      {isUnread && (
        <span
          aria-label="Unread"
          className="absolute top-3.5 right-3.5 w-2 h-2 rounded-full bg-strawberry flex-shrink-0"
        />
      )}

      <AgentAvatar agentId={activity.agent} />

      <div className="flex-1 min-w-0 pr-4">
        {/* Header */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-foreground">{agent.name}</span>
          <span className="text-[10px] text-muted-foreground/60">·</span>
          <span className="text-[10px] text-muted-foreground/70">{action.icon} {action.label}</span>
          <span className="ml-auto text-[10px] text-muted-foreground/60 whitespace-nowrap">{timeAgo}</span>
        </div>

        {/* Title */}
        <p className="text-xs font-medium text-foreground mt-0.5 leading-snug">{activity.title}</p>

        {/* Expanded description + metadata */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
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
        </AnimatePresence>

        {/* Expand toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleExpand() }}
          className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? 'Less' : 'Details'}
        </button>
      </div>
    </motion.div>
  )
}

// ===== Main Component =====

interface AgentActivityFeedProps {
  activities?: BotActivity[]
  maxItems?: number
  showViewAll?: boolean
  className?: string
}

export function AgentActivityFeed({
  activities,
  maxItems = 5,
  showViewAll = true,
  className,
}: AgentActivityFeedProps) {
  const source = activities ?? DEMO_BOT_ACTIVITIES
  const [readIds, setReadIds] = useState<Set<string>>(
    () => new Set(source.filter((a) => a.read).map((a) => a.id)),
  )

  const isDemo = !activities
  const items = source.slice(0, maxItems)
  const unreadCount = items.filter((a) => !readIds.has(a.id)).length

  const onRead = useCallback((id: string) => {
    setReadIds((prev) => new Set([...prev, id]))
  }, [])

  const onMarkAllRead = useCallback(() => {
    setReadIds(new Set(source.map((a) => a.id)))
  }, [source])

  return (
    <div id="agent-activity" className={cn('w-full', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 min-h-[24px]">
        <div className="flex items-center gap-2">
          {isDemo && (
            <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-muted/60 border border-border text-muted-foreground">
              Sample data
            </span>
          )}
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-strawberry/15 border border-strawberry/25 text-strawberry">
              {unreadCount} new
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={onMarkAllRead}
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <CheckCheck className="w-3 h-3" />
            Mark all read
          </button>
        )}
      </div>

      {/* Activity list */}
      <motion.div
        className="space-y-2"
        variants={stagger}
        initial="hidden"
        animate="visible"
      >
        {items.map((activity) => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            isUnread={!readIds.has(activity.id)}
            onRead={onRead}
          />
        ))}
      </motion.div>

      {/* View all link */}
      {showViewAll && (
        <Link href="/activity" className="block mt-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-xs text-muted-foreground hover:text-foreground gap-1.5 rounded-xl hover:bg-muted/40 h-8"
          >
            View all activity
            <ArrowRight className="w-3 h-3" />
          </Button>
        </Link>
      )}
    </div>
  )
}
