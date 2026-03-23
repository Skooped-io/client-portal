'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText,
  Download,
  Share2,
  TrendingUp,
  TrendingDown,
  Minus,
  Eye,
  X,
  Calendar,
  Users,
  Search,
  Megaphone,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react'
import { PageTransition } from '@/components/motion/PageTransition'
import { AnimatedCounter } from '@/components/motion/AnimatedCounter'
import { Skeleton, SkeletonCard, SkeletonText } from '@/components/motion/Skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { stagger, slideUp, scaleIn } from '@/lib/animations/variants'

// ===== Types =====

interface ReportMetric {
  label: string
  value: number
  prevValue: number
  prefix?: string
  suffix?: string
  decimals?: number
  formatNumber?: boolean
  icon: React.ElementType
}

interface MonthReport {
  id: string
  month: string
  dateGenerated: string
  pageCount: number
  fileSize: string
  metrics: ReportMetric[]
  highlights: string[]
}

// ===== Demo Data =====

const DEMO_REPORTS: MonthReport[] = [
  {
    id: 'march-2026',
    month: 'March 2026',
    dateGenerated: 'April 2, 2026',
    pageCount: 12,
    fileSize: '2.4 MB',
    metrics: [
      { label: 'Total Leads', value: 47, prevValue: 38, icon: Users, formatNumber: true },
      { label: 'Website Traffic', value: 8240, prevValue: 6910, icon: TrendingUp, formatNumber: true, suffix: ' visits' },
      { label: 'Google Ranking', value: 4.2, prevValue: 5.8, icon: Search, suffix: ' avg pos', decimals: 1 },
      { label: 'Ad Spend ROI', value: 312, prevValue: 276, icon: Megaphone, prefix: '', suffix: '%' },
    ],
    highlights: [
      'Organic traffic up 19% — best month yet',
      '3 new keywords hitting page 1',
      'LSA cost-per-lead dropped to $28.40',
      'GBP views increased 34% MoM',
    ],
  },
  {
    id: 'february-2026',
    month: 'February 2026',
    dateGenerated: 'March 3, 2026',
    pageCount: 11,
    fileSize: '2.1 MB',
    metrics: [
      { label: 'Total Leads', value: 38, prevValue: 31, icon: Users, formatNumber: true },
      { label: 'Website Traffic', value: 6910, prevValue: 5820, icon: TrendingUp, formatNumber: true, suffix: ' visits' },
      { label: 'Google Ranking', value: 5.8, prevValue: 7.1, icon: Search, suffix: ' avg pos', decimals: 1 },
      { label: 'Ad Spend ROI', value: 276, prevValue: 241, icon: Megaphone, suffix: '%' },
    ],
    highlights: [
      'Traffic milestone: 6,000+ monthly visitors',
      'LSA campaign fully optimized',
      '2 competitor keywords captured',
      'First 5-star review via GBP',
    ],
  },
  {
    id: 'january-2026',
    month: 'January 2026',
    dateGenerated: 'February 2, 2026',
    pageCount: 10,
    fileSize: '1.9 MB',
    metrics: [
      { label: 'Total Leads', value: 31, prevValue: 24, icon: Users, formatNumber: true },
      { label: 'Website Traffic', value: 5820, prevValue: 4700, icon: TrendingUp, formatNumber: true, suffix: ' visits' },
      { label: 'Google Ranking', value: 7.1, prevValue: 9.4, icon: Search, suffix: ' avg pos', decimals: 1 },
      { label: 'Ad Spend ROI', value: 241, prevValue: 198, icon: Megaphone, suffix: '%' },
    ],
    highlights: [
      'New year strong start — leads up 29%',
      'SEO foundation fully in place',
      'Google Ads quality score improved to 8/10',
      'Website speed score hit 94/100',
    ],
  },
]

// ===== Helper: Trend indicator =====

function getTrend(value: number, prevValue: number, lowerIsBetter = false): 'up' | 'down' | 'flat' {
  const diff = value - prevValue
  if (Math.abs(diff) < 0.01) return 'flat'
  const isPositive = lowerIsBetter ? diff < 0 : diff > 0
  return isPositive ? 'up' : 'down'
}

function getChangePercent(value: number, prevValue: number): string {
  if (prevValue === 0) return '—'
  const pct = Math.abs(((value - prevValue) / prevValue) * 100)
  return pct.toFixed(1) + '%'
}

// ===== Report Card =====

interface ReportCardProps {
  report: MonthReport
  isLatest: boolean
  onView: (report: MonthReport) => void
}

function ReportCard({ report, isLatest, onView }: ReportCardProps) {
  return (
    <motion.div
      variants={slideUp}
      whileHover={{ y: -3, transition: { duration: 0.15 } }}
      className="group rounded-lg md:rounded-2xl border border-border bg-card p-4 md:p-6 hover:border-strawberry/30 hover:shadow-lg hover:shadow-strawberry/5 transition-shadow cursor-pointer"
      onClick={() => onView(report)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-strawberry/10 flex items-center justify-center shrink-0">
            <FileText className="w-6 h-6 text-strawberry" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-nunito font-bold text-foreground">{report.month}</h3>
              {isLatest && (
                <Badge className="bg-mint/20 text-mint border-mint/30 text-[10px] px-1.5 py-0">
                  Latest
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Generated {report.dateGenerated}</p>
          </div>
        </div>

        {/* Riley badge */}
        <div className="flex items-center gap-1.5 bg-background border border-border rounded-full px-2.5 py-1">
          <Avatar className="h-5 w-5 border border-[#4CAF50]/40">
            <AvatarImage src="/agents/riley.png" alt="Riley" />
            <AvatarFallback className="text-[8px] bg-[#4CAF50] text-white font-bold">RI</AvatarFallback>
          </Avatar>
          <span className="text-[10px] font-medium text-muted-foreground">Generated by Riley</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {report.metrics.slice(0, 4).map((metric) => {
          const trend = getTrend(metric.value, metric.prevValue, metric.label === 'Google Ranking')
          const pct = getChangePercent(metric.value, metric.prevValue)
          const Icon = metric.icon
          return (
            <div key={metric.label} className="rounded-xl bg-background p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-muted-foreground">{metric.label}</span>
                <Icon className="w-3 h-3 text-muted-foreground" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-nunito font-bold text-foreground">
                  {metric.prefix ?? ''}{metric.value.toFixed(metric.decimals ?? 0)}{metric.suffix ?? ''}
                </span>
                <span
                  className={cn(
                    'text-[10px] font-medium flex items-center gap-0.5',
                    trend === 'up' ? 'text-mint' : trend === 'down' ? 'text-strawberry' : 'text-muted-foreground',
                  )}
                >
                  {trend === 'up' && <TrendingUp className="w-3 h-3" />}
                  {trend === 'down' && <TrendingDown className="w-3 h-3" />}
                  {trend === 'flat' && <Minus className="w-3 h-3" />}
                  {pct}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{report.pageCount} pages</span>
          <span>•</span>
          <span>{report.fileSize}</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onView(report) }}
          className="flex items-center gap-1 text-xs font-medium text-strawberry hover:text-strawberry/80 transition-colors"
        >
          View Report
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </motion.div>
  )
}

// ===== Report Modal / Expand View =====

interface ReportModalProps {
  report: MonthReport
  onClose: () => void
}

function ReportModal({ report, onClose }: ReportModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-2xl bg-background rounded-2xl border border-border shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between px-4 py-4 md:px-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-strawberry/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-strawberry" />
            </div>
            <div>
              <h2 className="font-nunito font-bold text-foreground text-lg">{report.month} Report</h2>
              <p className="text-xs text-muted-foreground">Generated {report.dateGenerated} • {report.pageCount} pages</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close report"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Metrics */}
        <div className="px-4 py-4 md:px-6 border-b border-border">
          <h3 className="text-sm font-medium text-foreground mb-4">Key Metrics vs. Previous Month</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {report.metrics.map((metric) => {
              const trend = getTrend(metric.value, metric.prevValue, metric.label === 'Google Ranking')
              const pct = getChangePercent(metric.value, metric.prevValue)
              const Icon = metric.icon
              return (
                <div key={metric.label} className="rounded-xl bg-card border border-border p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-strawberry/10 flex items-center justify-center">
                      <Icon className="w-3.5 h-3.5 text-strawberry" />
                    </div>
                    <span className="text-xs text-muted-foreground">{metric.label}</span>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <AnimatedCounter
                        value={metric.value}
                        prefix={metric.prefix ?? ''}
                        suffix={metric.suffix ?? ''}
                        decimals={metric.decimals ?? 0}
                        formatNumber={metric.formatNumber}
                        className="text-2xl font-nunito font-bold text-foreground"
                      />
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        vs.&nbsp;
                        {metric.prefix ?? ''}{metric.prevValue.toFixed(metric.decimals ?? 0)}{metric.suffix ?? ''}
                        &nbsp;last month
                      </p>
                    </div>
                    <span
                      className={cn(
                        'text-xs font-semibold flex items-center gap-1 px-2 py-1 rounded-lg',
                        trend === 'up' ? 'bg-mint/10 text-mint' : trend === 'down' ? 'bg-strawberry/10 text-strawberry' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {trend === 'up' && <TrendingUp className="w-3 h-3" />}
                      {trend === 'down' && <TrendingDown className="w-3 h-3" />}
                      {trend === 'flat' && <Minus className="w-3 h-3" />}
                      {pct}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Highlights */}
        <div className="px-4 py-4 md:px-6 border-b border-border">
          <h3 className="text-sm font-medium text-foreground mb-3">Highlights</h3>
          <ul className="space-y-2">
            {report.highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-mint shrink-0 mt-0.5" />
                {h}
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="px-4 py-4 md:px-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <Button className="flex-1 bg-strawberry hover:bg-strawberry/90 text-white rounded-xl gap-2">
            <Download className="w-4 h-4" />
            Download PDF
          </Button>
          <Button variant="outline" className="flex-1 rounded-xl border-border gap-2">
            <Share2 className="w-4 h-4" />
            Share with Team
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ===== Skeleton Loading =====

function ReportsSkeletonLoading() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <Skeleton className="h-5 w-40" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 py-2 border-b border-border last:border-0">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <SkeletonText lines={2} className="flex-1" />
            <Skeleton className="w-20 h-8 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ===== MoM Comparison Section =====

function MoMComparison({ current, previous }: { current: MonthReport; previous: MonthReport }) {
  return (
    <div className="rounded-lg md:rounded-2xl border border-border bg-card p-4 md:p-6 mb-6 md:mb-8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-nunito font-bold text-foreground">Month-over-Month Comparison</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{previous.month} → {current.month}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-mint">
            <div className="w-2 h-2 rounded-full bg-mint" />
            This month
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
            Last month
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {current.metrics.map((metric, idx) => {
          const prev = previous.metrics[idx]
          const trend = getTrend(metric.value, metric.prevValue, metric.label === 'Google Ranking')
          const pct = getChangePercent(metric.value, metric.prevValue)
          const Icon = metric.icon

          return (
            <div key={metric.label} className="text-center">
              <div className="w-10 h-10 rounded-xl bg-strawberry/10 flex items-center justify-center mx-auto mb-3">
                <Icon className="w-5 h-5 text-strawberry" />
              </div>
              <p className="text-[11px] text-muted-foreground mb-1">{metric.label}</p>
              <AnimatedCounter
                value={metric.value}
                prefix={metric.prefix ?? ''}
                suffix={metric.suffix ?? ''}
                decimals={metric.decimals ?? 0}
                formatNumber={metric.formatNumber}
                className="text-xl font-nunito font-bold text-foreground block"
              />
              <p className="text-xs text-muted-foreground mt-0.5">
                {metric.prefix ?? ''}{prev.value.toFixed(metric.decimals ?? 0)}{metric.suffix ?? ''}
              </p>
              <div
                className={cn(
                  'inline-flex items-center gap-1 text-[11px] font-semibold mt-1.5 px-2 py-0.5 rounded-full',
                  trend === 'up' ? 'bg-mint/10 text-mint' : trend === 'down' ? 'bg-strawberry/10 text-strawberry' : 'bg-muted text-muted-foreground',
                )}
              >
                {trend === 'up' && <TrendingUp className="w-3 h-3" />}
                {trend === 'down' && <TrendingDown className="w-3 h-3" />}
                {trend === 'flat' && <Minus className="w-3 h-3" />}
                {pct}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ===== Archive List =====

function ReportsArchive({ reports, onView }: { reports: MonthReport[]; onView: (r: MonthReport) => void }) {
  return (
    <div className="rounded-lg md:rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <h2 className="font-nunito font-bold text-foreground">Reports Archive</h2>
        <Badge variant="outline" className="text-xs border-border text-muted-foreground">
          {reports.length} reports
        </Badge>
      </div>

      <div className="divide-y divide-border">
        {reports.map((report) => (
          <div
            key={report.id}
            className="flex items-center gap-3 px-4 md:px-6 py-3 md:py-4 hover:bg-card-hover transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-strawberry/10 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-strawberry" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{report.month}</p>
              <p className="text-xs text-muted-foreground">
                <Calendar className="w-3 h-3 inline mr-1" />
                {report.dateGenerated} · {report.pageCount} pages · {report.fileSize}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="min-h-[44px] text-muted-foreground hover:text-foreground rounded-xl gap-1.5"
                onClick={() => onView(report)}
              >
                <Eye className="w-3.5 h-3.5" />
                View
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px] rounded-xl border-border gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                PDF
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ===== Main Page =====

export default function ReportsPage() {
  const [isLoading] = useState(false)
  const [activeReport, setActiveReport] = useState<MonthReport | null>(null)

  if (isLoading) {
    return (
      <PageTransition>
        <div className="px-4 py-6 md:px-6 md:py-8 lg:px-8">
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-64 mb-8" />
          <ReportsSkeletonLoading />
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <div className="px-4 py-6 md:px-6 md:py-8 lg:px-8 max-w-6xl mx-auto">
        {/* Page Header */}
        <div className="flex items-start justify-between gap-3 mb-6 md:mb-8">
          <div>
            <motion.h1
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xl sm:text-2xl font-nunito font-bold text-foreground"
            >
              Reports
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="text-muted-foreground text-sm mt-1"
            >
              Monthly performance reports, generated by Riley.
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
          >
            <Button className="rounded-xl gap-2 bg-strawberry hover:bg-strawberry/90 text-white">
              <Share2 className="w-4 h-4" />
              Share with Team
            </Button>
          </motion.div>
        </div>

        {/* MoM Comparison */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <MoMComparison
            current={DEMO_REPORTS[0]}
            previous={DEMO_REPORTS[1]}
          />
        </motion.div>

        {/* Report Cards Grid */}
        <div className="mb-4">
          <h2 className="font-nunito font-bold text-foreground mb-1">Monthly Reports</h2>
          <p className="text-xs text-muted-foreground">Click a report to view the full breakdown</p>
        </div>
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8"
        >
          {DEMO_REPORTS.map((report, i) => (
            <ReportCard
              key={report.id}
              report={report}
              isLatest={i === 0}
              onView={setActiveReport}
            />
          ))}
        </motion.div>

        {/* Archive */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <ReportsArchive reports={DEMO_REPORTS} onView={setActiveReport} />
        </motion.div>
      </div>

      {/* Report Modal */}
      <AnimatePresence>
        {activeReport && (
          <ReportModal report={activeReport} onClose={() => setActiveReport(null)} />
        )}
      </AnimatePresence>
    </PageTransition>
  )
}
