'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Megaphone,
  TrendingUp,
  Phone,
  DollarSign,
  Users,
  ArrowUpRight,
  Circle,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageTransition } from '@/components/motion/PageTransition'
import { Skeleton } from '@/components/motion/Skeleton'
import { stagger, slideUp } from '@/lib/animations/variants'
import { cn } from '@/lib/utils'

// ===== Demo Data =====

type CampaignStatus = 'active' | 'paused' | 'ended'

const campaigns = [
  {
    id: 1,
    name: 'Vinyl Fencing - Spring Promo',
    status: 'active' as CampaignStatus,
    type: 'Google LSA',
    budget: 1500,
    spend: 1124,
    leads: 34,
    cpl: 33.06,
    startDate: 'Mar 1, 2026',
  },
  {
    id: 2,
    name: 'General Fencing Services',
    status: 'active' as CampaignStatus,
    type: 'Google Ads',
    budget: 800,
    spend: 612,
    leads: 18,
    cpl: 34.0,
    startDate: 'Feb 15, 2026',
  },
  {
    id: 3,
    name: 'Wood Fence Retargeting',
    status: 'paused' as CampaignStatus,
    type: 'Google Ads',
    budget: 400,
    spend: 387,
    leads: 9,
    cpl: 43.0,
    startDate: 'Jan 10, 2026',
  },
  {
    id: 4,
    name: 'Holiday Special 2025',
    status: 'ended' as CampaignStatus,
    type: 'Google Ads',
    budget: 600,
    spend: 598,
    leads: 22,
    cpl: 27.18,
    startDate: 'Dec 1, 2025',
  },
]

const leadsData = [
  { id: 1, name: 'Michael Torres', source: 'LSA', status: 'new', date: 'Mar 15, 2026', phone: '(615) 555-0183' },
  { id: 2, name: 'Jennifer Walsh', source: 'Google Ads', status: 'contacted', date: 'Mar 14, 2026', phone: '(615) 555-0291' },
  { id: 3, name: 'David Kim', source: 'LSA', status: 'quoted', date: 'Mar 13, 2026', phone: '(629) 555-0147' },
  { id: 4, name: 'Sarah Mitchell', source: 'Google Ads', status: 'won', date: 'Mar 12, 2026', phone: '(615) 555-0358' },
  { id: 5, name: 'Robert Nguyen', source: 'LSA', status: 'new', date: 'Mar 11, 2026', phone: '(615) 555-0472' },
  { id: 6, name: 'Amanda Foster', source: 'Google Ads', status: 'lost', date: 'Mar 10, 2026', phone: '(629) 555-0589' },
  { id: 7, name: 'James Cooper', source: 'LSA', status: 'quoted', date: 'Mar 9, 2026', phone: '(615) 555-0614' },
]

const funnelStages = [
  { label: 'Impressions', value: 14800, color: '#6366F1', width: '100%' },
  { label: 'Clicks', value: 1044, color: '#FF6987', width: '72%' },
  { label: 'Leads', value: 83, color: '#48C78E', width: '50%' },
  { label: 'Quoted', value: 31, color: '#FBE98A', width: '34%' },
  { label: 'Won', value: 12, color: '#C99035', width: '20%' },
]

const weeklyLeads = [
  { week: 'Wk 1', leads: 8 },
  { week: 'Wk 2', leads: 14 },
  { week: 'Wk 3', leads: 11 },
  { week: 'Wk 4', leads: 19 },
  { week: 'Wk 5', leads: 16 },
  { week: 'Wk 6', leads: 22 },
]

// ===== Sub-components =====

function SampleBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border">
      Sample data
    </span>
  )
}

const statusConfig: Record<CampaignStatus, { label: string; dot: string; badge: string }> = {
  active: {
    label: 'Active',
    dot: 'bg-emerald-500 animate-pulse',
    badge: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  },
  paused: {
    label: 'Paused',
    dot: 'bg-amber-400',
    badge: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
  },
  ended: {
    label: 'Ended',
    dot: 'bg-muted-foreground',
    badge: 'bg-muted text-muted-foreground border-border',
  },
}

const leadStatusConfig: Record<string, string> = {
  new: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  contacted: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  quoted: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
  won: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  lost: 'bg-muted text-muted-foreground border-border',
}

function CPLRing({ cpl, budget }: { cpl: number; budget: number }) {
  const maxCpl = 60
  const score = Math.min((cpl / maxCpl) * 100, 100)
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color = cpl < 30 ? '#48C78E' : cpl < 45 ? '#FBE98A' : '#FF6987'

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-28 h-28 flex items-center justify-center">
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-border" />
          <motion.circle
            cx="50" cy="50" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
          />
        </svg>
        <div className="text-center">
          <span className="text-xl font-bold font-nunito text-foreground">${cpl.toFixed(0)}</span>
          <p className="text-[10px] text-muted-foreground">per lead</p>
        </div>
      </div>
      <div className="text-center">
        <p className="text-xs text-muted-foreground">Avg. Cost Per Lead</p>
        <p className={cn('text-xs font-medium', cpl < 40 ? 'text-emerald-500' : 'text-amber-400')}>
          {cpl < 40 ? '✓ On target' : '↑ Above target'}
        </p>
      </div>
    </div>
  )
}

function BudgetBar({ spend, budget }: { spend: number; budget: number }) {
  const pct = Math.min((spend / budget) * 100, 100)
  const color = pct > 90 ? '#FF6987' : pct > 70 ? '#FBE98A' : '#48C78E'

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Spend</span>
        <span className="font-medium text-foreground">${spend.toLocaleString()} / ${budget.toLocaleString()}</span>
      </div>
      <div className="h-2 rounded-full bg-border overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.2 }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground text-right">{pct.toFixed(0)}% utilized</p>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 shadow-xl text-sm">
      <p className="text-muted-foreground text-xs mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="font-medium" style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  )
}

// ===== Main Page =====

export default function AdsPage() {
  const [_loading] = useState(false)
  const loading = _loading

  const totalSpend = campaigns.reduce((a, c) => a + c.spend, 0)
  const totalBudget = campaigns.reduce((a, c) => a + c.budget, 0)
  const totalLeads = campaigns.reduce((a, c) => a + c.leads, 0)
  const avgCpl = totalSpend / totalLeads

  return (
    <PageTransition>
      <div className="px-4 py-6 md:px-6 md:py-8 lg:px-8 max-w-7xl mx-auto space-y-4 md:space-y-6">

        {/* Header */}
        <motion.div variants={slideUp} initial="hidden" animate="visible" className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl sm:text-2xl font-nunito font-bold text-foreground">Ads & Leads</h1>
              <SampleBadge />
            </div>
            <p className="text-muted-foreground text-sm">
              Campaign performance, cost per lead, and your lead pipeline.
            </p>
          </div>
        </motion.div>

        {/* Summary Stats */}
        <motion.div variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Ad Spend', value: `$${totalSpend.toLocaleString()}`, icon: DollarSign, color: 'text-strawberry' },
            { label: 'Total Leads', value: totalLeads, icon: Users, color: 'text-blueberry' },
            { label: 'Avg. Cost / Lead', value: `$${avgCpl.toFixed(2)}`, icon: TrendingUp, color: 'text-mint' },
            { label: 'Active Campaigns', value: campaigns.filter((c) => c.status === 'active').length, icon: Megaphone, color: 'text-vanilla' },
          ].map((stat) => {
            const Icon = stat.icon
            return (
              <motion.div key={stat.label} variants={slideUp}>
                <Card className="bg-card border-border rounded-lg md:rounded-xl">
                  <CardContent className="p-4 md:p-5">
                    {loading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-7 w-16" />
                      </div>
                    ) : (
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
                          <p className="text-2xl font-nunito font-bold text-foreground">{stat.value}</p>
                        </div>
                        <div className={cn('p-2 rounded-lg bg-card-hover', stat.color)}>
                          <Icon className="w-4 h-4" />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </motion.div>

        {/* Campaign Cards */}
        <motion.div variants={slideUp} initial="hidden" animate="visible" transition={{ delay: 0.1 }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-nunito font-semibold text-foreground">Active Campaigns</h2>
            <SampleBadge />
          </div>
          <motion.div variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {campaigns.map((campaign) => {
              const sc = statusConfig[campaign.status]
              return (
                <motion.div key={campaign.id} variants={slideUp}>
                  <Card className="bg-card border-border rounded-lg md:rounded-xl hover:bg-card-hover transition-colors">
                    <CardContent className="p-4 md:p-5 space-y-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{campaign.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{campaign.type} · Started {campaign.startDate}</p>
                        </div>
                        <span className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border shrink-0', sc.badge)}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
                          {sc.label}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                          <p className="text-lg font-bold font-nunito text-foreground">{campaign.leads}</p>
                          <p className="text-[10px] text-muted-foreground">Leads</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold font-nunito text-foreground">${campaign.cpl.toFixed(0)}</p>
                          <p className="text-[10px] text-muted-foreground">Cost/Lead</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold font-nunito text-foreground">${campaign.spend.toLocaleString()}</p>
                          <p className="text-[10px] text-muted-foreground">Spend</p>
                        </div>
                      </div>

                      <BudgetBar spend={campaign.spend} budget={campaign.budget} />
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </motion.div>
        </motion.div>

        {/* CPL Ring + Funnel */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* CPL + Weekly Leads Chart */}
          <motion.div variants={slideUp} initial="hidden" animate="visible" transition={{ delay: 0.15 }}>
            <Card className="bg-card border-border rounded-xl h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-strawberry" />
                    <CardTitle className="text-sm font-nunito font-semibold">Cost Per Lead</CardTitle>
                  </div>
                  <SampleBadge />
                </div>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-6">
                <CPLRing cpl={avgCpl} budget={totalBudget} />
                <div className="w-full">
                  <p className="text-xs text-muted-foreground mb-2">Weekly Lead Volume</p>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={weeklyLeads} margin={{ top: 4, right: 0, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="week" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar
                        dataKey="leads"
                        name="Leads"
                        fill="#FF6987"
                        radius={[4, 4, 0, 0]}
                        isAnimationActive
                        animationDuration={800}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Lead Funnel */}
          <motion.div variants={slideUp} initial="hidden" animate="visible" transition={{ delay: 0.2 }}>
            <Card className="bg-card border-border rounded-xl h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="w-4 h-4 text-strawberry" />
                    <CardTitle className="text-sm font-nunito font-semibold">Lead Pipeline</CardTitle>
                  </div>
                  <SampleBadge />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-2">
                {funnelStages.map((stage, i) => (
                  <div key={stage.label} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">{stage.label}</span>
                      <span className="font-medium text-foreground">{stage.value.toLocaleString()}</span>
                    </div>
                    <div className="h-8 rounded-lg bg-border/50 overflow-hidden relative">
                      <motion.div
                        className="h-full rounded-lg flex items-center pl-3"
                        style={{ backgroundColor: stage.color + '30', borderLeft: `3px solid ${stage.color}` }}
                        initial={{ width: 0 }}
                        animate={{ width: stage.width }}
                        transition={{ duration: 0.8, ease: 'easeOut', delay: i * 0.08 }}
                      />
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground text-center">
                    <span className="text-emerald-500 font-semibold">14.5%</span> conversion: Impressions → Lead
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Lead List Table */}
        <motion.div variants={slideUp} initial="hidden" animate="visible" transition={{ delay: 0.25 }}>
          <Card className="bg-card border-border rounded-xl">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-strawberry" />
                  <CardTitle className="text-sm font-nunito font-semibold">Recent Leads</CardTitle>
                </div>
                <SampleBadge />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="px-6 pb-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4 py-3 border-b border-border last:border-0">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="h-3 w-20 ml-auto" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-2 border-b border-border text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    <span>Contact</span>
                    <span>Phone</span>
                    <span>Source</span>
                    <span>Date</span>
                    <span>Status</span>
                  </div>
                  <motion.div variants={stagger} initial="hidden" animate="visible">
                    {leadsData.map((lead) => (
                      <motion.div
                        key={lead.id}
                        variants={slideUp}
                        className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto_auto] gap-2 md:gap-4 px-4 py-3 border-b border-border last:border-0 hover:bg-card-hover transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-strawberry/10 flex items-center justify-center text-strawberry text-xs font-bold shrink-0">
                            {lead.name.split(' ').map((n) => n[0]).join('')}
                          </div>
                          <span className="text-sm font-medium text-foreground">{lead.name}</span>
                        </div>
                        <span className="text-sm text-muted-foreground self-center hidden md:block">{lead.phone}</span>
                        <span className="text-xs text-muted-foreground self-center hidden md:block">{lead.source}</span>
                        <span className="text-xs text-muted-foreground self-center hidden md:block">{lead.date}</span>
                        <span className={cn('self-center inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize', leadStatusConfig[lead.status])}>
                          {lead.status}
                        </span>
                      </motion.div>
                    ))}
                  </motion.div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

      </div>
    </PageTransition>
  )
}
