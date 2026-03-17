'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, HelpCircle, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { scaleIn } from '@/lib/animations/variants'

export interface AIInsight {
  id: string
  title: string
  message: string
  priority?: 'high' | 'medium' | 'low'
  actions?: {
    apply?: string
    learnMore?: string
  }
}

const DEMO_INSIGHTS: AIInsight[] = [
  {
    id: '1',
    title: 'Keyword opportunity detected',
    message: 'Your top keyword dropped 3 spots this week. Competitors added 8 new backlinks. I recommend updating your service page with 3 specific phrases that are trending in your area.',
    priority: 'high',
    actions: { apply: 'Update My Page', learnMore: 'Why This Matters' },
  },
  {
    id: '2',
    title: 'Best time to post this week',
    message: 'Your audience is most active Tuesday–Thursday between 6–8 PM. I scheduled your next 3 posts accordingly for maximum reach.',
    priority: 'medium',
    actions: { apply: 'View Schedule' },
  },
]

const PRIORITY_STYLES: Record<string, string> = {
  high: 'border-l-strawberry bg-strawberry/5',
  medium: 'border-l-[#C99035] bg-vanilla/5',
  low: 'border-l-blueberry bg-blueberry/5',
}

interface InsightCardProps {
  insight: AIInsight
  onDismiss: (id: string) => void
}

function InsightCard({ insight, onDismiss }: InsightCardProps) {
  const [applied, setApplied] = useState(false)

  return (
    <motion.div
      variants={scaleIn}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, scale: 0.95, y: -8, transition: { duration: 0.2 } }}
      layout
      className={cn(
        'relative rounded-xl border border-l-4 p-4 shadow-sm',
        insight.priority ? PRIORITY_STYLES[insight.priority] : 'border-l-border',
        'border-border'
      )}
    >
      {/* Dismiss button */}
      <button
        onClick={() => onDismiss(insight.id)}
        className="absolute top-3 right-3 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        aria-label="Dismiss insight"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {/* Cooper avatar + name */}
      <div className="flex items-center gap-2.5 mb-3 pr-6">
        <div
          className="w-8 h-8 rounded-full bg-strawberry/15 border border-strawberry/30 flex items-center justify-center shrink-0"
          aria-label="Cooper"
        >
          <Sparkles className="w-4 h-4 text-strawberry" />
        </div>
        <div>
          <p className="text-xs font-semibold text-foreground">Cooper</p>
          <p className="text-[10px] text-muted-foreground">AI Insight</p>
        </div>
      </div>

      {/* Chat bubble message */}
      <div className="relative ml-10">
        <div className="rounded-xl rounded-tl-none bg-muted/50 border border-border px-3.5 py-3">
          <p className="text-xs font-semibold text-foreground mb-1">{insight.title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{insight.message}</p>
        </div>

        {/* Action buttons */}
        {insight.actions && (
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            {insight.actions.apply && (
              <button
                onClick={() => setApplied(true)}
                disabled={applied}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200',
                  applied
                    ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/25 cursor-default'
                    : 'bg-strawberry text-white hover:bg-strawberry-600 active:scale-95'
                )}
              >
                {applied ? (
                  <>
                    <Check className="w-3 h-3" />
                    Applied
                  </>
                ) : (
                  insight.actions.apply
                )}
              </button>
            )}
            {insight.actions.learnMore && (
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
                <HelpCircle className="w-3 h-3" />
                {insight.actions.learnMore}
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}

interface AIInsightsPanelProps {
  insights?: AIInsight[]
  className?: string
}

export function AIInsightsPanel({ insights, className }: AIInsightsPanelProps) {
  const initialInsights = insights ?? DEMO_INSIGHTS
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const visible = initialInsights.filter((i) => !dismissed.has(i.id))

  const handleDismiss = (id: string) => {
    setDismissed((prev) => new Set([...prev, id]))
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className={cn('w-full', className)}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-strawberry" />
        <h3 className="text-sm font-semibold text-foreground">AI Insights</h3>
        {visible.length > 0 && (
          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-strawberry text-white">
            {visible.length}
          </span>
        )}
      </div>

      <AnimatePresence mode="popLayout">
        {visible.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-8 text-center rounded-xl border border-border bg-card/40"
          >
            <Sparkles className="w-8 h-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground font-medium">All caught up!</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Cooper will surface new insights when there&apos;s something to act on.
            </p>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {visible.map((insight) => (
              <InsightCard key={insight.id} insight={insight} onDismiss={handleDismiss} />
            ))}
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
