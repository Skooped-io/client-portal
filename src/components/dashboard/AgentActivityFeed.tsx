'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { slideInRight } from '@/lib/animations/variants'

// ===== Types =====

export type AgentId = 'scout' | 'bob' | 'sierra' | 'riley' | 'mark' | 'sandra' | 'cooper'
export type ActivityStatus = 'completed' | 'in_progress' | 'failed'

export interface AgentActivity {
  id: string
  agent: AgentId
  action: string
  detail?: string
  status: ActivityStatus
  timestamp: Date
  metadata?: Record<string, string | number>
}

// ===== Agent Config =====

const AGENTS: Record<AgentId, { name: string; initials: string; color: string; bg: string }> = {
  scout:   { name: 'Scout',   initials: 'S',  color: '#5B8DEF', bg: 'rgba(91,141,239,0.12)'  },
  bob:     { name: 'Bob',     initials: 'B',  color: '#E8C87A', bg: 'rgba(232,200,122,0.12)' },
  sierra:  { name: 'Sierra',  initials: 'Si', color: '#C99035', bg: 'rgba(201,144,53,0.12)'  },
  riley:   { name: 'Riley',   initials: 'R',  color: '#4CAF50', bg: 'rgba(76,175,80,0.12)'   },
  mark:    { name: 'Mark',    initials: 'M',  color: '#D94A7A', bg: 'rgba(217,74,122,0.12)'  },
  sandra:  { name: 'Sandra',  initials: 'Sa', color: '#E8C87A', bg: 'rgba(232,200,122,0.12)' },
  cooper:  { name: 'Cooper',  initials: 'C',  color: '#D94A7A', bg: 'rgba(217,74,122,0.15)'  },
}

const STATUS_CONFIG: Record<ActivityStatus, { label: string; classes: string; dotClass?: string }> = {
  completed:   { label: 'Done',        classes: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' },
  in_progress: { label: 'In Progress', classes: 'bg-blue-500/15 text-blue-400 border border-blue-500/25',     dotClass: 'animate-pulse bg-blue-400' },
  failed:      { label: 'Failed',      classes: 'bg-red-500/15 text-red-400 border border-red-500/25' },
}

// ===== Demo Data =====

export const DEMO_ACTIVITIES: AgentActivity[] = [
  {
    id: '1',
    agent: 'scout',
    action: 'Updated keyword rankings for 24 target keywords',
    detail: 'Top keyword "garage door repair franklin tn" moved from position 7 to position 4. Local pack visibility increased by 12%.',
    status: 'completed',
    timestamp: new Date(Date.now() - 1000 * 60 * 12),
    metadata: { keywords_checked: 24, improvements: 8, drops: 2 },
  },
  {
    id: '2',
    agent: 'sierra',
    action: 'Scheduled 3 Instagram posts for this week',
    detail: 'Monday, Wednesday, and Friday posts queued. Content includes project showcase, before/after, and seasonal promo.',
    status: 'completed',
    timestamp: new Date(Date.now() - 1000 * 60 * 45),
    metadata: { posts_scheduled: 3, platforms: 'instagram' },
  },
  {
    id: '3',
    agent: 'scout',
    action: 'Monitoring Google Ads performance',
    detail: 'Current campaign CTR: 4.2%. Average CPC: $3.18. 2 ad variations being A/B tested.',
    status: 'in_progress',
    timestamp: new Date(Date.now() - 1000 * 60 * 90),
    metadata: { ctr: '4.2%', avg_cpc: '$3.18' },
  },
  {
    id: '4',
    agent: 'riley',
    action: 'Generated monthly performance report',
    detail: 'March 2026 report compiled with GSC data, Analytics, and GMB insights. Ready for client review.',
    status: 'completed',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3),
  },
  {
    id: '5',
    agent: 'cooper',
    action: 'Reviewed and approved website copy updates',
    detail: 'Service page headlines updated. New testimonials section approved. About page refreshed.',
    status: 'completed',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6),
  },
  {
    id: '6',
    agent: 'mark',
    action: 'Security audit completed — no vulnerabilities found',
    status: 'completed',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 12),
  },
]

// ===== Sub-components =====

function AgentAvatar({ agentId }: { agentId: AgentId }) {
  const agent = AGENTS[agentId]
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border"
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

function StatusBadge({ status }: { status: ActivityStatus }) {
  const config = STATUS_CONFIG[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold', config.classes)}>
      {config.dotClass && (
        <span className={cn('w-1.5 h-1.5 rounded-full', config.dotClass)} />
      )}
      {config.label}
    </span>
  )
}

function ActivityCard({ activity, isNew }: { activity: AgentActivity; isNew?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const agent = AGENTS[activity.agent]
  const timeAgo = formatDistanceToNow(activity.timestamp, { addSuffix: true })

  return (
    <motion.div
      variants={slideInRight}
      initial={isNew ? 'hidden' : false}
      animate="visible"
      className={cn(
        'group flex gap-3 p-4 rounded-xl border transition-all duration-200',
        'bg-card/50 border-border hover:bg-card hover:border-border/80',
        activity.detail && 'cursor-pointer'
      )}
      onClick={() => activity.detail && setExpanded((e) => !e)}
    >
      <AgentAvatar agentId={activity.agent} />

      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{agent.name}</span>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={activity.status} />
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">{timeAgo}</span>
          </div>
        </div>

        {/* Action */}
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{activity.action}</p>

        {/* Expanded detail */}
        <AnimatePresence>
          {expanded && activity.detail && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="mt-3 p-3 rounded-lg bg-muted/40 border border-border">
                <p className="text-xs text-muted-foreground leading-relaxed">{activity.detail}</p>
                {activity.metadata && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {Object.entries(activity.metadata).map(([k, v]) => (
                      <span key={k} className="text-[10px] bg-background/60 px-2 py-0.5 rounded-md border border-border text-muted-foreground">
                        {k.replace(/_/g, ' ')}: <span className="text-foreground font-medium">{v}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expand toggle */}
        {activity.detail && (
          <button className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'Less' : 'Details'}
          </button>
        )}
      </div>
    </motion.div>
  )
}

// ===== Main Component =====

interface AgentActivityFeedProps {
  activities?: AgentActivity[]
  maxItems?: number
  isDemo?: boolean
  showViewAll?: boolean
  className?: string
}

export function AgentActivityFeed({
  activities,
  maxItems = 5,
  isDemo,
  showViewAll = true,
  className,
}: AgentActivityFeedProps) {
  const items = (activities ?? DEMO_ACTIVITIES).slice(0, maxItems)
  const showingDemo = isDemo ?? !activities

  return (
    <div id="agent-activity" className={cn('w-full', className)}>
      {showingDemo && (
        <div className="flex items-center gap-2 mb-3">
          <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-muted/60 border border-border text-muted-foreground">
            Sample data
          </span>
        </div>
      )}

      <div className="space-y-2">
        {items.map((activity) => (
          <ActivityCard key={activity.id} activity={activity} />
        ))}
      </div>

      {showViewAll && (
        <button className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center py-2 rounded-lg hover:bg-muted/40">
          <ExternalLink className="w-3 h-3" />
          View all activity
        </button>
      )}
    </div>
  )
}
