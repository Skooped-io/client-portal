'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import {
  X,
  Tag,
  Clock,
  TrendingUp,
  CheckCircle2,
  ChevronRight,
  MessageCircle,
  Send,
  Zap,
  Shield,
  BarChart3,
  Globe,
  FileText,
  DollarSign,
  Search,
} from 'lucide-react'
import { PageTransition } from '@/components/motion/PageTransition'
import { cn } from '@/lib/utils'

// ===== Agent Data =====

interface AgentActivity {
  id: string
  action: string
  timestamp: string
  detail?: string
}

interface Agent {
  id: string
  name: string
  role: string
  pronouns: string
  bio: string
  fullBio: string
  color: string
  avatar: string
  status: 'online' | 'working' | 'idle'
  currentTask: string
  skills: string[]
  stats: { label: string; value: string }[]
  recentActivity: AgentActivity[]
  icon: React.ElementType
}

const AGENTS: Agent[] = [
  {
    id: 'cooper',
    name: 'Cooper',
    role: 'Operations Lead',
    pronouns: 'he/him',
    bio: 'Orchestrates your entire team. Every task flows through Cooper first — he makes sure quality is locked before anything reaches you.',
    fullBio:
      "Cooper is the central brain of your Skooped team. Every agent reports to him, and he reviews all work before it ever reaches you. He's your direct point of contact — the one holding everything together and making sure your business is moving in the right direction around the clock.",
    color: '#D94A7A',
    avatar: '/cooper_avatar.png',
    status: 'working',
    currentTask: 'Reviewing this month\'s SEO report before delivery',
    skills: ['Team Orchestration', 'Quality Control', 'Client Strategy', 'AI Coordination', 'Workflow Design'],
    stats: [
      { label: 'Tasks Coordinated', value: '312' },
      { label: 'Reports Reviewed', value: '24' },
      { label: 'Avg Response Time', value: '< 2 min' },
      { label: 'Client Satisfaction', value: '99%' },
    ],
    recentActivity: [
      { id: '1', action: 'Reviewed and approved SEO report', timestamp: '2 hours ago', detail: 'Flagged 2 quick wins for Scout to action' },
      { id: '2', action: 'Coordinated content calendar sync', timestamp: '5 hours ago', detail: 'Aligned Sierra\'s schedule with upcoming campaign' },
      { id: '3', action: 'Quality-checked website deployment', timestamp: 'Yesterday', detail: 'Approved Bob\'s latest landing page update' },
      { id: '4', action: 'Generated AI insights summary', timestamp: '2 days ago', detail: 'Delivered 4 recommendations to your dashboard' },
      { id: '5', action: 'Escalated ad budget alert to Jake', timestamp: '3 days ago', detail: 'Held spend pending your approval' },
    ],
    icon: Zap,
  },
  {
    id: 'scout',
    name: 'Scout',
    role: 'SEO & Ads Specialist',
    pronouns: 'he/him',
    bio: 'Owns your search rankings and ad campaigns. Scout knows exactly where you rank, what keywords matter, and how to get your phone ringing.',
    fullBio:
      'Scout monitors your Google Search Console daily, tracks keyword movement, optimizes your Google Business Profile, and manages your Local Service Ads campaigns. He\'s obsessed with rankings — when a keyword drops, Scout\'s already on it before you even notice.',
    color: '#5B8DEF',
    avatar: '/scout_avatar.png',
    status: 'working',
    currentTask: 'Analyzing keyword ranking shifts from last 7 days',
    skills: ['Google Search Console', 'Keyword Strategy', 'Google Ads', 'Local Service Ads', 'GBP Optimization', 'Competitor Analysis'],
    stats: [
      { label: 'SEO Audits Completed', value: '42' },
      { label: 'Keywords Tracked', value: '187' },
      { label: 'Ranking Improvements', value: '63' },
      { label: 'Avg. Position Gained', value: '+14' },
    ],
    recentActivity: [
      { id: '1', action: 'Updated 12 target keywords', timestamp: '1 hour ago', detail: 'Added high-intent local terms for your market' },
      { id: '2', action: 'GBP optimization pass complete', timestamp: '4 hours ago', detail: 'Updated service areas and business description' },
      { id: '3', action: 'LSA campaign budget reviewed', timestamp: 'Yesterday', detail: 'CPL down 18% vs last month' },
      { id: '4', action: 'Competitor gap analysis run', timestamp: '2 days ago', detail: 'Found 3 high-value keywords you\'re not targeting' },
      { id: '5', action: 'Monthly impressions report generated', timestamp: '3 days ago', detail: '8,247 impressions — up 34% MoM' },
    ],
    icon: Search,
  },
  {
    id: 'bob',
    name: 'Bob',
    role: 'Lead Developer',
    pronouns: 'he/him',
    bio: 'Builds and maintains your website. Bob handles everything from landing page updates to performance optimization — your site is always in good hands.',
    fullBio:
      'Bob is the engineer behind your digital presence. He builds custom pages, optimizes site speed, pushes updates, and makes sure your website is always converting. Nothing breaks on his watch — and when something needs to be built, he ships it fast.',
    color: '#C99035',
    avatar: '/bob_avatar.png',
    status: 'online',
    currentTask: 'Monitoring site performance metrics',
    skills: ['Next.js', 'Web Performance', 'Landing Pages', 'Deployment', 'Conversion Optimization', 'CRO'],
    stats: [
      { label: 'Pages Built', value: '28' },
      { label: 'Deployments', value: '91' },
      { label: 'Avg. Page Speed', value: '94/100' },
      { label: 'Uptime', value: '99.9%' },
    ],
    recentActivity: [
      { id: '1', action: 'Deployed service area landing page', timestamp: '3 hours ago', detail: 'New page targeting Franklin + Brentwood' },
      { id: '2', action: 'Site speed optimized', timestamp: 'Yesterday', detail: 'LCP improved from 2.8s to 1.4s' },
      { id: '3', action: 'Contact form A/B test launched', timestamp: '2 days ago', detail: 'Testing 2 CTA variants for conversion' },
      { id: '4', action: 'SSL certificate renewed', timestamp: '4 days ago', detail: 'Auto-renewed, zero downtime' },
      { id: '5', action: 'Homepage hero section updated', timestamp: '5 days ago', detail: 'New messaging approved by Cooper' },
    ],
    icon: Globe,
  },
  {
    id: 'sierra',
    name: 'Sierra',
    role: 'Content Strategist',
    pronouns: 'she/her',
    bio: 'Creates and schedules your social content. Sierra keeps your Instagram and Facebook active, on-brand, and consistently growing your audience.',
    fullBio:
      'Sierra runs your content calendar. She creates Instagram and Facebook posts, writes captions, plans campaigns, and schedules everything in advance so your social presence never goes quiet. Every post goes through Cooper before it goes live.',
    color: '#C99035',
    avatar: '/sierra_avatar.png',
    status: 'working',
    currentTask: 'Writing captions for next week\'s content batch',
    skills: ['Instagram Strategy', 'Facebook Content', 'Caption Writing', 'Content Calendars', 'Brand Voice', 'Hashtag Research'],
    stats: [
      { label: 'Posts Scheduled', value: '127' },
      { label: 'Avg. Engagement Rate', value: '4.2%' },
      { label: 'Content Pieces Created', value: '340' },
      { label: 'Campaigns Run', value: '11' },
    ],
    recentActivity: [
      { id: '1', action: 'Scheduled 7 posts for next week', timestamp: '30 min ago', detail: 'Mix of before/after, tips, and promos' },
      { id: '2', action: 'Engagement report reviewed', timestamp: '3 hours ago', detail: 'Reel outperformed static by 3x' },
      { id: '3', action: 'April content calendar finalized', timestamp: 'Yesterday', detail: '28 posts planned, 14 already in queue' },
      { id: '4', action: 'New hashtag set researched', timestamp: '2 days ago', detail: '15 local + 10 niche tags added' },
      { id: '5', action: 'Story sequence created', timestamp: '3 days ago', detail: '5-part series on your team process' },
    ],
    icon: FileText,
  },
  {
    id: 'riley',
    name: 'Riley',
    role: 'Analytics Lead',
    pronouns: 'she/her',
    bio: 'Turns your data into plain-English insights. Riley pulls reports, tracks trends, and makes sure you always know exactly how your business is performing.',
    fullBio:
      'Riley aggregates data from Google Analytics, Search Console, and your ad platforms into clean, readable reports. She spots trends before they become problems and makes sure every metric is contextualized — not just numbers, but what they mean for your business.',
    color: '#4CAF50',
    avatar: '/riley_avatar.png',
    status: 'online',
    currentTask: 'Preparing March monthly performance summary',
    skills: ['Google Analytics 4', 'Data Visualization', 'Performance Reporting', 'Trend Analysis', 'KPI Tracking', 'Monthly Reports'],
    stats: [
      { label: 'Reports Generated', value: '36' },
      { label: 'Metrics Tracked', value: '47' },
      { label: 'Insights Delivered', value: '189' },
      { label: 'Data Sources', value: '6' },
    ],
    recentActivity: [
      { id: '1', action: 'Traffic trend analysis complete', timestamp: '1 hour ago', detail: 'Organic up 28% — top 3 pages identified' },
      { id: '2', action: 'Conversion funnel reviewed', timestamp: '6 hours ago', detail: 'Drop-off on contact page flagged for Bob' },
      { id: '3', action: 'Weekly digest published', timestamp: 'Yesterday', detail: 'Summary sent to your dashboard' },
      { id: '4', action: 'GA4 event tracking verified', timestamp: '3 days ago', detail: 'All form submissions firing correctly' },
      { id: '5', action: 'Q1 performance summary drafted', timestamp: '4 days ago', detail: 'Pending Cooper\'s review before delivery' },
    ],
    icon: BarChart3,
  },
  {
    id: 'mark',
    name: 'Mark',
    role: 'Security Chief',
    pronouns: 'he/him',
    bio: 'Keeps your digital assets locked down. Mark handles cybersecurity, site hardening, API key management, and threat monitoring 24/7.',
    fullBio:
      "Mark is your silent guardian. He runs regular security audits, monitors for vulnerabilities, manages API credentials, and makes sure nothing and no one gets into your systems that shouldn't be there. He reports threats to Cooper immediately — nothing gets past him.",
    color: '#6D1326',
    avatar: '/mark_avatar.png',
    status: 'online',
    currentTask: 'Running weekly security audit',
    skills: ['Cybersecurity', 'Site Hardening', 'API Security', 'Vulnerability Scanning', 'Incident Response', 'Access Control'],
    stats: [
      { label: 'Security Audits', value: '52' },
      { label: 'Threats Blocked', value: '14' },
      { label: 'APIs Secured', value: '23' },
      { label: 'Zero Incidents', value: '180+ days' },
    ],
    recentActivity: [
      { id: '1', action: 'Weekly vulnerability scan complete', timestamp: '2 hours ago', detail: 'No issues found — all clear' },
      { id: '2', action: 'API key rotation completed', timestamp: 'Yesterday', detail: 'Rotated 4 keys per 30-day schedule' },
      { id: '3', action: 'Login anomaly investigated', timestamp: '3 days ago', detail: 'False positive — flagged and cleared' },
      { id: '4', action: 'Security headers hardened', timestamp: '5 days ago', detail: 'CSP and HSTS tightened on your domain' },
      { id: '5', action: 'Monthly security summary filed', timestamp: '1 week ago', detail: 'All systems healthy, no open vulnerabilities' },
    ],
    icon: Shield,
  },
  {
    id: 'sandra',
    name: 'Sandra',
    role: 'Operations Analyst',
    pronouns: 'she/her',
    bio: 'Watches every dollar spent on your behalf. Sandra tracks costs, finds savings, and makes sure you\'re getting maximum value from every tool and service.',
    fullBio:
      'Sandra monitors token costs, API usage, tool subscriptions, and operational expenses across the entire Skooped stack running for your business. She flags inefficiencies and recommends optimizations — her job is to make sure every dollar works harder for you.',
    color: '#E8C87A',
    avatar: '/sandra_avatar.png',
    status: 'idle',
    currentTask: 'Reviewing March operational costs',
    skills: ['Cost Optimization', 'Budget Tracking', 'Usage Analytics', 'Vendor Management', 'ROI Analysis', 'Forecasting'],
    stats: [
      { label: 'Costs Monitored', value: '$12.4K' },
      { label: 'Savings Found', value: '$2.1K' },
      { label: 'Budget Alerts', value: '8' },
      { label: 'Reports Filed', value: '31' },
    ],
    recentActivity: [
      { id: '1', action: 'Monthly cost report compiled', timestamp: '4 hours ago', detail: 'Operational costs down 12% vs February' },
      { id: '2', action: 'Tool subscription audit complete', timestamp: 'Yesterday', detail: 'Identified 1 unused tool — flagged for removal' },
      { id: '3', action: 'API usage spike reviewed', timestamp: '3 days ago', detail: 'Spike tied to scheduled SEO crawl — normal' },
      { id: '4', action: 'Budget forecast updated', timestamp: '5 days ago', detail: 'Q2 projection within plan' },
      { id: '5', action: 'Cost-per-task analysis shared', timestamp: '1 week ago', detail: 'Efficiency up 18% vs Q4 baseline' },
    ],
    icon: DollarSign,
  },
]

// ===== Timeline Activity (combined feed) =====

interface TimelineItem {
  agentId: string
  agentName: string
  agentAvatar: string
  agentColor: string
  action: string
  timestamp: string
  detail?: string
}

const TIMELINE_ITEMS: TimelineItem[] = [
  { agentId: 'sierra', agentName: 'Sierra', agentAvatar: '/sierra_avatar.png', agentColor: '#C99035', action: 'Scheduled 7 posts for next week', timestamp: '30 min ago', detail: 'Mix of before/after, tips, and promos' },
  { agentId: 'scout', agentName: 'Scout', agentAvatar: '/scout_avatar.png', agentColor: '#5B8DEF', action: 'Updated 12 target keywords', timestamp: '1 hour ago', detail: 'Added high-intent local terms for your market' },
  { agentId: 'cooper', agentName: 'Cooper', agentAvatar: '/cooper_avatar.png', agentColor: '#D94A7A', action: 'Reviewed and approved SEO report', timestamp: '2 hours ago', detail: 'Flagged 2 quick wins for Scout to action' },
  { agentId: 'bob', agentName: 'Bob', agentAvatar: '/bob_avatar.png', agentColor: '#C99035', action: 'Deployed service area landing page', timestamp: '3 hours ago', detail: 'New page targeting Franklin + Brentwood' },
  { agentId: 'riley', agentName: 'Riley', agentAvatar: '/riley_avatar.png', agentColor: '#4CAF50', action: 'Traffic trend analysis complete', timestamp: '1 hour ago', detail: 'Organic up 28% — top 3 pages identified' },
  { agentId: 'mark', agentName: 'Mark', agentAvatar: '/mark_avatar.png', agentColor: '#6D1326', action: 'Weekly vulnerability scan complete', timestamp: '2 hours ago', detail: 'No issues found — all clear' },
  { agentId: 'scout', agentName: 'Scout', agentAvatar: '/scout_avatar.png', agentColor: '#5B8DEF', action: 'GBP optimization pass complete', timestamp: '4 hours ago', detail: 'Updated service areas and business description' },
  { agentId: 'cooper', agentName: 'Cooper', agentAvatar: '/cooper_avatar.png', agentColor: '#D94A7A', action: 'Coordinated content calendar sync', timestamp: '5 hours ago', detail: "Aligned Sierra's schedule with upcoming campaign" },
  { agentId: 'riley', agentName: 'Riley', agentAvatar: '/riley_avatar.png', agentColor: '#4CAF50', action: 'Conversion funnel reviewed', timestamp: '6 hours ago', detail: 'Drop-off on contact page flagged for Bob' },
  { agentId: 'sandra', agentName: 'Sandra', agentAvatar: '/sandra_avatar.png', agentColor: '#E8C87A', action: 'Monthly cost report compiled', timestamp: '4 hours ago', detail: 'Operational costs down 12% vs February' },
]

// ===== Animation Variants =====

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.075,
      delayChildren: 0.1,
    },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 28 },
  },
}

const timelineVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.2,
    },
  },
}

const timelineItemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 28 },
  },
}

const modalVariants = {
  hidden: { opacity: 0, scale: 0.94, y: 12 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 350, damping: 30 },
  },
  exit: {
    opacity: 0,
    scale: 0.94,
    y: 12,
    transition: { duration: 0.2, ease: 'easeIn' as const },
  },
}

// ===== Status Indicator =====

function StatusDot({ status }: { status: Agent['status'] }) {
  if (status === 'working') {
    return (
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
      </span>
    )
  }
  if (status === 'online') {
    return (
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
      </span>
    )
  }
  return <span className="inline-flex rounded-full h-2.5 w-2.5 bg-muted-foreground/30" />
}

function StatusLabel({ status }: { status: Agent['status'] }) {
  if (status === 'working') return <span className="text-amber-500 dark:text-amber-400">Working</span>
  if (status === 'online') return <span className="text-emerald-500 dark:text-emerald-400">Online</span>
  return <span className="text-muted-foreground">Idle</span>
}

// ===== Agent Card =====

interface AgentCardProps {
  agent: Agent
  onClick: (agent: Agent) => void
  index: number
}

function AgentCard({ agent, onClick, index: _index }: AgentCardProps) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <motion.div
      variants={cardVariants}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onClick={() => onClick(agent)}
      className="relative rounded-xl border border-border bg-card cursor-pointer overflow-hidden group"
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      style={{
        boxShadow: isHovered
          ? `0 8px 32px -8px ${agent.color}40, 0 0 0 1px ${agent.color}30`
          : undefined,
      }}
    >
      {/* Color accent top bar */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5 opacity-60"
        style={{ background: `linear-gradient(90deg, transparent, ${agent.color}, transparent)` }}
      />

      {/* Hover glow overlay */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ opacity: isHovered ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        style={{
          background: `radial-gradient(ellipse at 50% 0%, ${agent.color}08 0%, transparent 70%)`,
        }}
      />

      <div className="p-5 relative z-10">
        {/* Header: avatar + status */}
        <div className="flex items-start justify-between mb-4">
          <div className="relative">
            <motion.div
              animate={{ scale: isHovered ? 1.04 : 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <div
                className="w-20 h-20 rounded-xl overflow-hidden border-2"
                style={{ borderColor: `${agent.color}50` }}
              >
                <Image
                  src={agent.avatar}
                  alt={agent.name}
                  width={80}
                  height={80}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback: show colored initial circle
                    const target = e.currentTarget as HTMLImageElement
                    target.style.display = 'none'
                    const parent = target.parentElement
                    if (parent) {
                      parent.style.background = agent.color
                      parent.style.display = 'flex'
                      parent.style.alignItems = 'center'
                      parent.style.justifyContent = 'center'
                      parent.innerHTML = `<span style="color:white;font-weight:700;font-size:1.5rem">${agent.name[0]}</span>`
                    }
                  }}
                />
              </div>
            </motion.div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              <StatusDot status={agent.status} />
              <span className="text-xs font-medium">
                <StatusLabel status={agent.status} />
              </span>
            </div>
          </div>
        </div>

        {/* Name, role, pronouns */}
        <div className="mb-3">
          <h3 className="font-nunito font-bold text-base text-foreground leading-tight">{agent.name}</h3>
          <p className="text-sm font-medium" style={{ color: agent.color }}>{agent.role}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{agent.pronouns}</p>
        </div>

        {/* Bio */}
        <p className="text-xs text-muted-foreground leading-relaxed mb-4 line-clamp-3">
          {agent.bio}
        </p>

        {/* Currently working on */}
        <div className="flex items-start gap-2 rounded-lg bg-background/60 dark:bg-background/40 border border-border/50 px-3 py-2">
          <motion.div
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div
              className="w-1.5 h-1.5 rounded-full mt-1 shrink-0"
              style={{ backgroundColor: agent.color }}
            />
          </motion.div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            <span className="font-medium text-foreground/80">Now: </span>
            {agent.currentTask}
          </p>
        </div>

        {/* Expand hint */}
        <motion.div
          className="flex items-center gap-1 mt-3 text-[10px] font-medium"
          style={{ color: agent.color }}
          animate={{ opacity: isHovered ? 1 : 0, x: isHovered ? 0 : -4 }}
          transition={{ duration: 0.2 }}
        >
          <span>View details</span>
          <ChevronRight className="w-3 h-3" />
        </motion.div>
      </div>
    </motion.div>
  )
}

// ===== Agent Detail Modal =====

interface AgentModalProps {
  agent: Agent | null
  onClose: () => void
}

function AgentModal({ agent, onClose }: AgentModalProps) {
  return (
    <AnimatePresence>
      {agent && (
        <>
          {/* Backdrop */}
          <motion.div
            key="modal-backdrop"
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            key="modal-panel"
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-x-4 top-[5vh] bottom-[5vh] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-2xl z-50 overflow-y-auto rounded-2xl bg-background border border-border shadow-2xl"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-10 p-1.5 rounded-lg bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Hero banner */}
            <div
              className="relative h-24 rounded-t-2xl overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${agent.color}25 0%, ${agent.color}08 100%)`,
              }}
            >
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  background: `radial-gradient(ellipse at 30% 50%, ${agent.color} 0%, transparent 60%)`,
                }}
              />
              <div
                className="absolute bottom-0 left-0 right-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${agent.color}60, transparent)` }}
              />
            </div>

            {/* Content */}
            <div className="px-6 pb-8">
              {/* Avatar + name (overlaps hero) */}
              <div className="flex items-end gap-4 -mt-10 mb-5">
                <div
                  className="w-20 h-20 rounded-xl overflow-hidden border-2 shadow-lg bg-card"
                  style={{ borderColor: agent.color }}
                >
                  <Image
                    src={agent.avatar}
                    alt={agent.name}
                    width={80}
                    height={80}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement
                      target.style.display = 'none'
                      const parent = target.parentElement
                      if (parent) {
                        parent.style.background = agent.color
                        parent.style.display = 'flex'
                        parent.style.alignItems = 'center'
                        parent.style.justifyContent = 'center'
                        parent.innerHTML = `<span style="color:white;font-weight:700;font-size:1.5rem">${agent.name[0]}</span>`
                      }
                    }}
                  />
                </div>
                <div className="pb-1">
                  <h2 className="font-nunito font-bold text-xl text-foreground">{agent.name}</h2>
                  <p className="text-sm font-medium" style={{ color: agent.color }}>{agent.role}</p>
                  <p className="text-xs text-muted-foreground">{agent.pronouns}</p>
                </div>
                <div className="ml-auto pb-1 flex items-center gap-2">
                  <StatusDot status={agent.status} />
                  <StatusLabel status={agent.status} />
                </div>
              </div>

              {/* Full bio */}
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">About</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{agent.fullBio}</p>
              </div>

              {/* Currently working on */}
              <div
                className="flex items-start gap-3 rounded-xl border px-4 py-3 mb-6"
                style={{ borderColor: `${agent.color}30`, backgroundColor: `${agent.color}08` }}
              >
                <motion.div
                  animate={{ scale: [1, 1.4, 1] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  className="mt-0.5 shrink-0"
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: agent.color }} />
                </motion.div>
                <div>
                  <p className="text-xs font-semibold text-foreground/80 mb-0.5">Currently Working On</p>
                  <p className="text-sm text-muted-foreground">{agent.currentTask}</p>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                {agent.stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-border bg-card px-4 py-3 text-center"
                  >
                    <p className="font-nunito font-bold text-xl text-foreground" style={{ color: agent.color }}>
                      {stat.value}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Skills */}
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Skills & Expertise</h3>
                <div className="flex flex-wrap gap-2">
                  {agent.skills.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border"
                      style={{
                        color: agent.color,
                        borderColor: `${agent.color}40`,
                        backgroundColor: `${agent.color}10`,
                      }}
                    >
                      <Tag className="w-2.5 h-2.5" />
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {/* Recent activity */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent Activity for Your Business</h3>
                <div className="space-y-3">
                  {agent.recentActivity.map((item, i) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06, type: 'spring', stiffness: 300, damping: 28 }}
                      className="flex items-start gap-3"
                    >
                      <div className="flex flex-col items-center shrink-0 pt-1">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: agent.color }} />
                        {i < agent.recentActivity.length - 1 && (
                          <div className="w-px flex-1 mt-1" style={{ backgroundColor: `${agent.color}20`, minHeight: '24px' }} />
                        )}
                      </div>
                      <div className="flex-1 pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">{item.action}</p>
                          <div className="flex items-center gap-1 shrink-0 text-muted-foreground">
                            <Clock className="w-2.5 h-2.5" />
                            <span className="text-[10px]">{item.timestamp}</span>
                          </div>
                        </div>
                        {item.detail && (
                          <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ===== Skeleton Loading =====

function AgentCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4 overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-muted/30 to-transparent bg-[length:200%_100%] animate-shimmer" />
      <div className="flex items-start justify-between">
        <div className="w-20 h-20 rounded-xl bg-muted animate-pulse" />
        <div className="w-16 h-3 rounded bg-muted animate-pulse" />
      </div>
      <div className="space-y-2">
        <div className="w-24 h-4 rounded bg-muted animate-pulse" />
        <div className="w-32 h-3 rounded bg-muted animate-pulse" />
        <div className="w-16 h-2.5 rounded bg-muted animate-pulse" />
      </div>
      <div className="space-y-1">
        <div className="w-full h-2.5 rounded bg-muted animate-pulse" />
        <div className="w-4/5 h-2.5 rounded bg-muted animate-pulse" />
        <div className="w-3/5 h-2.5 rounded bg-muted animate-pulse" />
      </div>
      <div className="w-full h-10 rounded-lg bg-muted animate-pulse" />
    </div>
  )
}

// ===== Main Page =====

export default function TeamPage() {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [isLoading] = useState(false)

  return (
    <PageTransition>
      <div className="min-h-full px-4 py-6 md:px-8 md:py-8 max-w-7xl mx-auto">

        {/* ===== Hero Section ===== */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="mb-10"
        >
          <div className="flex items-center gap-2 mb-1">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.15 }}
              className="w-8 h-8 rounded-lg bg-strawberry/10 flex items-center justify-center"
            >
              <Zap className="w-4 h-4 text-strawberry" />
            </motion.div>
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="text-xs font-semibold text-strawberry uppercase tracking-wider"
            >
              Active 24/7
            </motion.span>
          </div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="font-nunito font-bold text-3xl md:text-4xl text-foreground mb-2"
          >
            Your Team
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="text-muted-foreground text-base max-w-lg"
          >
            Meet the specialists working on your business 24/7. Click any agent to see what they've been doing for you.
          </motion.p>

          {/* Quick stat bar */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="flex flex-wrap items-center gap-4 mt-5"
          >
            {[
              { icon: CheckCircle2, label: '23 tasks completed this month', color: 'text-emerald-500' },
              { icon: TrendingUp, label: '7 agents online', color: 'text-blueberry' },
              { icon: Clock, label: 'Last action 30 min ago', color: 'text-muted-foreground' },
            ].map(({ icon: Icon, label, color }, i) => (
              <div key={i} className={cn('flex items-center gap-1.5 text-sm', color)}>
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* ===== Agent Card Grid ===== */}
        <h2 className="sr-only">Meet the Agents</h2>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-12">
            {[...Array(7)].map((_, i) => <AgentCardSkeleton key={i} />)}
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-12"
          >
            {AGENTS.map((agent, index) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onClick={setSelectedAgent}
                index={index}
              />
            ))}
          </motion.div>
        )}

        {/* ===== Team Activity Timeline ===== */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          {/* Timeline header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-nunito font-bold text-xl text-foreground">Team Activity</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Everything your team has done for your business recently</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <motion.span
                animate={{ scale: [1, 1.4, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="w-2 h-2 rounded-full bg-emerald-500 inline-block"
              />
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                23 tasks this month
              </span>
            </div>
          </div>

          {/* Timeline feed */}
          <motion.div
            variants={timelineVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
            className="rounded-xl border border-border bg-card overflow-hidden"
          >
            {TIMELINE_ITEMS.map((item, i) => (
              <motion.div
                key={`${item.agentId}-${i}`}
                variants={timelineItemVariants}
                className={cn(
                  'flex items-start gap-4 px-5 py-4',
                  i < TIMELINE_ITEMS.length - 1 && 'border-b border-border/50',
                )}
              >
                {/* Agent avatar */}
                <div className="shrink-0 relative">
                  <div
                    className="w-9 h-9 rounded-lg overflow-hidden border"
                    style={{ borderColor: `${item.agentColor}40` }}
                  >
                    <Image
                      src={item.agentAvatar}
                      alt={item.agentName}
                      width={36}
                      height={36}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.currentTarget as HTMLImageElement
                        target.style.display = 'none'
                        const parent = target.parentElement
                        if (parent) {
                          parent.style.background = item.agentColor
                          parent.style.display = 'flex'
                          parent.style.alignItems = 'center'
                          parent.style.justifyContent = 'center'
                          parent.innerHTML = `<span style="color:white;font-weight:700;font-size:0.75rem">${item.agentName[0]}</span>`
                        }
                      }}
                    />
                  </div>
                  {/* Color dot */}
                  <div
                    className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card"
                    style={{ backgroundColor: item.agentColor }}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-sm font-semibold" style={{ color: item.agentColor }}>
                        {item.agentName}
                      </span>
                      <span className="text-sm text-foreground ml-1">{item.action}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span className="text-xs whitespace-nowrap">{item.timestamp}</span>
                    </div>
                  </div>
                  {item.detail && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{item.detail}</p>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        {/* ===== Ask Cooper Section ===== */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5 }}
        >
          <div className="rounded-2xl border border-border bg-card overflow-hidden relative">
            {/* Background accent */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-strawberry/5 blur-3xl translate-x-1/2 -translate-y-1/2" />
              <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-strawberry/5 blur-2xl -translate-x-1/4 translate-y-1/4" />
            </div>

            <div className="relative z-10 p-6 md:p-8">
              <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                {/* Cooper avatar + intro */}
                <div className="flex items-center gap-4 shrink-0">
                  <motion.div
                    animate={{ scale: [1, 1.03, 1] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    className="relative"
                  >
                    <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-strawberry/40 shadow-strawberry-glow">
                      <Image
                        src="/cooper_avatar.png"
                        alt="Cooper"
                        width={64}
                        height={64}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.currentTarget as HTMLImageElement
                          target.style.display = 'none'
                          const parent = target.parentElement
                          if (parent) {
                            parent.style.background = '#D94A7A'
                            parent.style.display = 'flex'
                            parent.style.alignItems = 'center'
                            parent.style.justifyContent = 'center'
                            parent.innerHTML = '<span style="color:white;font-weight:700;font-size:1.5rem">C</span>'
                          }
                        }}
                      />
                    </div>
                    {/* Online indicator */}
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-card" />
                    </span>
                  </motion.div>

                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-nunito font-bold text-lg text-foreground">Cooper</p>
                      <span className="text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                        Online
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">Operations Lead · Always here</p>
                    <p className="text-sm text-foreground/80 mt-1 font-medium">
                      Have a question about your business?
                    </p>
                  </div>
                </div>

                {/* Chat input */}
                <div className="flex-1 w-full">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 relative">
                      <div className="flex items-center gap-3 rounded-xl border border-border bg-background/80 px-4 py-3 focus-within:border-strawberry/50 focus-within:ring-1 focus-within:ring-strawberry/20 transition-all">
                        <MessageCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                        <input
                          type="text"
                          placeholder="Ask Cooper anything about your business..."
                          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none border-0 ring-0"
                          disabled
                        />
                      </div>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      className="flex items-center gap-2 px-5 py-3 rounded-xl bg-strawberry text-white font-semibold text-sm shadow-strawberry-glow transition-opacity"
                      disabled
                      style={{ opacity: 0.9 }}
                    >
                      <Send className="w-4 h-4" />
                      <span className="hidden sm:inline">Ask Cooper</span>
                    </motion.button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 ml-1">
                    💬 Live chat coming soon — Cooper will respond in real time
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ===== Agent Detail Modal ===== */}
      <AgentModal agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
    </PageTransition>
  )
}
