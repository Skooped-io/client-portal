'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Instagram,
  Facebook,
  Calendar,
  Heart,
  MessageCircle,
  Share2,
  Upload,
  Clock,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageTransition } from '@/components/motion/PageTransition'
import { Skeleton } from '@/components/motion/Skeleton'
import { stagger, slideUp } from '@/lib/animations/variants'
import { cn } from '@/lib/utils'

// ===== Demo Data =====

type Platform = 'instagram' | 'facebook'
type PostStatus = 'scheduled' | 'posted' | 'draft'

interface ScheduledPost {
  id: number
  platform: Platform
  caption: string
  scheduledTime: string
  date: Date
  status: PostStatus
  likes: number
  comments: number
  shares: number
  hasImage: boolean
}

const demoPostsRaw: Omit<ScheduledPost, 'date'>[] = [
  {
    id: 1,
    platform: 'instagram',
    caption: 'Spring is the perfect time to upgrade your outdoor space. Our vinyl fences are built to last 🌿',
    scheduledTime: '9:00 AM',
    status: 'posted',
    likes: 47,
    comments: 8,
    shares: 3,
    hasImage: true,
  },
  {
    id: 2,
    platform: 'facebook',
    caption: 'Did you know a new fence can increase your home\'s curb appeal by up to 20%? Get a free estimate today.',
    scheduledTime: '12:00 PM',
    status: 'scheduled',
    likes: 0,
    comments: 0,
    shares: 0,
    hasImage: true,
  },
  {
    id: 3,
    platform: 'instagram',
    caption: 'Before & after: this cedar wood fence transformed the backyard completely. Swipe to see the difference 👀',
    scheduledTime: '3:00 PM',
    status: 'posted',
    likes: 89,
    comments: 14,
    shares: 7,
    hasImage: true,
  },
  {
    id: 4,
    platform: 'facebook',
    caption: 'Our team wrapped up another beautiful aluminum fence project in Franklin. Zero rust, zero maintenance. 💪',
    scheduledTime: '11:00 AM',
    status: 'scheduled',
    likes: 0,
    comments: 0,
    shares: 0,
    hasImage: false,
  },
  {
    id: 5,
    platform: 'instagram',
    caption: 'Your dogs deserve a safe yard. Here\'s one of our recent privacy fence installs — great for pets & kids! 🐕',
    scheduledTime: '10:00 AM',
    status: 'draft',
    likes: 0,
    comments: 0,
    shares: 0,
    hasImage: true,
  },
  {
    id: 6,
    platform: 'facebook',
    caption: 'Quick tip: always ask your contractor about permit requirements before a fence install. We handle it all for you.',
    scheduledTime: '2:00 PM',
    status: 'posted',
    likes: 31,
    comments: 5,
    shares: 9,
    hasImage: false,
  },
  {
    id: 7,
    platform: 'instagram',
    caption: 'Wrought iron gates for the win 🔑 These add serious security AND elegance to your property.',
    scheduledTime: '8:00 AM',
    status: 'scheduled',
    likes: 0,
    comments: 0,
    shares: 0,
    hasImage: true,
  },
  {
    id: 8,
    platform: 'facebook',
    caption: 'Spring sale is on! Mention this post for 10% off any fence installation booked in March.',
    scheduledTime: '1:00 PM',
    status: 'scheduled',
    likes: 0,
    comments: 0,
    shares: 0,
    hasImage: false,
  },
]

const engagementData = [
  { date: 'Mar 1', likes: 38, comments: 6, shares: 2 },
  { date: 'Mar 5', likes: 72, comments: 11, shares: 5 },
  { date: 'Mar 9', likes: 54, comments: 8, shares: 3 },
  { date: 'Mar 13', likes: 91, comments: 17, shares: 9 },
  { date: 'Mar 17', likes: 68, comments: 12, shares: 6 },
  { date: 'Mar 21', likes: 114, comments: 22, shares: 11 },
  { date: 'Mar 25', likes: 88, comments: 16, shares: 8 },
  { date: 'Mar 29', likes: 127, comments: 24, shares: 14 },
]

// ===== Calendar Logic =====

function buildCalendarDays(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days: (Date | null)[] = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d))
  return days
}

function assignPostsToDays(year: number, month: number): Record<number, ScheduledPost[]> {
  const map: Record<number, ScheduledPost[]> = {}
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // Distribute 8 demo posts across the month
  const postDays = [3, 6, 10, 14, 17, 20, 24, 28]
  demoPostsRaw.forEach((p, i) => {
    const day = postDays[i % postDays.length]
    if (day <= daysInMonth) {
      const post: ScheduledPost = { ...p, date: new Date(year, month, day) }
      if (!map[day]) map[day] = []
      map[day].push(post)
    }
  })
  return map
}

// ===== Sub-components =====

function SampleBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border">
      Sample data
    </span>
  )
}

function PlatformIcon({ platform, size = 'sm' }: { platform: Platform; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'
  if (platform === 'instagram') return <Instagram className={cn(cls, 'text-pink-400')} />
  return <Facebook className={cn(cls, 'text-blue-400')} />
}

const statusStyles: Record<PostStatus, string> = {
  scheduled: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  posted: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  draft: 'bg-muted text-muted-foreground border-border',
}

function PostCard({ post }: { post: ScheduledPost }) {
  return (
    <Card className="bg-card border-border rounded-xl hover:bg-card-hover transition-colors">
      <CardContent className="p-4 space-y-3">
        {/* Image placeholder */}
        {post.hasImage && (
          <div className="w-full h-28 rounded-lg bg-card-hover border border-border flex items-center justify-center">
            <ImageIcon className="w-6 h-6 text-muted-foreground" />
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PlatformIcon platform={post.platform} />
            <span className="text-xs text-muted-foreground capitalize">{post.platform}</span>
          </div>
          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border capitalize', statusStyles[post.status])}>
            {post.status}
          </span>
        </div>

        {/* Caption */}
        <p className="text-sm text-foreground leading-relaxed line-clamp-2">{post.caption}</p>

        {/* Time */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{post.scheduledTime}</span>
        </div>

        {/* Engagement */}
        {post.status === 'posted' && (
          <div className="flex items-center gap-4 pt-1 border-t border-border">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Heart className="w-3 h-3 text-red-400" /> {post.likes}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <MessageCircle className="w-3 h-3 text-blue-400" /> {post.comments}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Share2 className="w-3 h-3 text-emerald-400" /> {post.shares}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DragDropZone() {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  return (
    <motion.div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      animate={isDragOver ? { scale: 1.02, borderColor: '#FF6987' } : { scale: 1 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition-colors',
        isDragOver
          ? 'border-strawberry bg-strawberry/5'
          : 'border-border hover:border-muted-foreground hover:bg-card-hover',
      )}
    >
      <motion.div
        animate={isDragOver ? { y: -4 } : { y: 0 }}
        transition={{ duration: 0.15 }}
        className="w-12 h-12 rounded-xl bg-strawberry/10 flex items-center justify-center"
      >
        <Upload className="w-5 h-5 text-strawberry" />
      </motion.div>
      <div>
        <p className="text-sm font-medium text-foreground">
          {isDragOver ? 'Drop files here' : 'Upload Photos & Videos'}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Drag & drop or click to browse · JPG, PNG, MP4 up to 50MB
        </p>
      </div>
      <button className="px-4 py-1.5 rounded-lg bg-strawberry text-white text-xs font-medium hover:bg-strawberry/90 transition-colors">
        Browse Files
      </button>
    </motion.div>
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

// ===== Mini Calendar =====

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function ContentCalendarGrid({ onSelectPost }: { onSelectPost: (post: ScheduledPost) => void }) {
  const today = new Date()
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [currentYear, setCurrentYear] = useState(today.getFullYear())

  const calDays = buildCalendarDays(currentYear, currentMonth)
  const postsByDay = assignPostsToDays(currentYear, currentMonth)

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1) }
    else setCurrentMonth((m) => m - 1)
  }
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1) }
    else setCurrentMonth((m) => m + 1)
  }

  return (
    <div className="space-y-3">
      {/* Nav */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-nunito font-semibold text-foreground">
          {MONTH_NAMES[currentMonth]} {currentYear}
        </h3>
        <div className="flex gap-1">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-card-hover transition-colors text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-card-hover transition-colors text-muted-foreground hover:text-foreground">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {calDays.map((day, i) => {
          const dayNum = day?.getDate()
          const isToday = day?.toDateString() === today.toDateString()
          const posts = dayNum ? postsByDay[dayNum] ?? [] : []

          return (
            <div
              key={i}
              className={cn(
                'min-h-[56px] rounded-lg p-1 text-xs transition-colors',
                !day ? '' : 'hover:bg-card-hover cursor-pointer',
              )}
            >
              {day && (
                <>
                  <div className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-medium mb-0.5',
                    isToday ? 'bg-strawberry text-white' : 'text-muted-foreground',
                  )}>
                    {dayNum}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {posts.slice(0, 2).map((post) => (
                      <button
                        key={post.id}
                        onClick={() => onSelectPost(post)}
                        className={cn(
                          'w-full rounded text-[9px] px-1 py-0.5 truncate text-left font-medium',
                          post.platform === 'instagram' ? 'bg-pink-400/20 text-pink-400' : 'bg-blue-400/20 text-blue-400',
                        )}
                      >
                        {post.platform === 'instagram' ? 'IG' : 'FB'} {post.scheduledTime}
                      </button>
                    ))}
                    {posts.length > 2 && (
                      <span className="text-[9px] text-muted-foreground pl-1">+{posts.length - 2}</span>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ===== Main Page =====

export default function ContentPage() {
  const [_loading] = useState(false)
  const loading = _loading
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null)

  // Build recent posts list from demo data
  const recentPosts: ScheduledPost[] = demoPostsRaw.map((p, i) => ({
    ...p,
    date: new Date(2026, 2, 3 + i * 3),
  }))

  const totalLikes = recentPosts.filter((p) => p.status === 'posted').reduce((a, p) => a + p.likes, 0)
  const totalComments = recentPosts.filter((p) => p.status === 'posted').reduce((a, p) => a + p.comments, 0)
  const totalShares = recentPosts.filter((p) => p.status === 'posted').reduce((a, p) => a + p.shares, 0)

  return (
    <PageTransition>
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <motion.div variants={slideUp} initial="hidden" animate="visible" className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-nunito font-bold text-foreground">Content & Social</h1>
              <SampleBadge />
            </div>
            <p className="text-muted-foreground text-sm">
              Content calendar, post previews, and engagement analytics.
            </p>
          </div>
        </motion.div>

        {/* Engagement Stats */}
        <motion.div variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Likes', value: totalLikes, icon: Heart, color: 'text-red-400', bg: 'bg-red-400/10' },
            { label: 'Total Comments', value: totalComments, icon: MessageCircle, color: 'text-blue-400', bg: 'bg-blue-400/10' },
            { label: 'Total Shares', value: totalShares, icon: Share2, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
          ].map((stat) => {
            const Icon = stat.icon
            return (
              <motion.div key={stat.label} variants={slideUp}>
                <Card className="bg-card border-border rounded-xl">
                  <CardContent className="p-5">
                    {loading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-7 w-12" />
                      </div>
                    ) : (
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
                          <p className="text-2xl font-nunito font-bold text-foreground">{stat.value}</p>
                        </div>
                        <div className={cn('p-2 rounded-lg', stat.bg, stat.color)}>
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

        {/* Calendar + Selected Post */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Calendar */}
          <motion.div variants={slideUp} initial="hidden" animate="visible" transition={{ delay: 0.1 }} className="lg:col-span-2">
            <Card className="bg-card border-border rounded-xl">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-strawberry" />
                    <CardTitle className="text-sm font-nunito font-semibold">Content Calendar</CardTitle>
                  </div>
                  <SampleBadge />
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-64 w-full rounded-lg" />
                ) : (
                  <ContentCalendarGrid onSelectPost={setSelectedPost} />
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Selected post or legend */}
          <motion.div variants={slideUp} initial="hidden" animate="visible" transition={{ delay: 0.15 }}>
            <AnimatePresence mode="wait">
              {selectedPost ? (
                <motion.div key="post-detail" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
                  <Card className="bg-card border-border rounded-xl">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-nunito font-semibold">Post Preview</CardTitle>
                        <button onClick={() => setSelectedPost(null)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <PostCard post={selectedPost} />
                    </CardContent>
                  </Card>
                </motion.div>
              ) : (
                <motion.div key="legend" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Card className="bg-card border-border rounded-xl">
                    <CardHeader>
                      <CardTitle className="text-sm font-nunito font-semibold">Legend</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-2 rounded-full bg-pink-400/40 inline-block" />
                        <Instagram className="w-3.5 h-3.5 text-pink-400" />
                        <span className="text-xs text-muted-foreground">Instagram post</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-2 rounded-full bg-blue-400/40 inline-block" />
                        <Facebook className="w-3.5 h-3.5 text-blue-400" />
                        <span className="text-xs text-muted-foreground">Facebook post</span>
                      </div>
                      <div className="border-t border-border pt-3 space-y-2">
                        <p className="text-xs font-medium text-foreground">Status</p>
                        {[
                          { s: 'posted', label: 'Live on social' },
                          { s: 'scheduled', label: 'Going out soon' },
                          { s: 'draft', label: 'Needs review' },
                        ].map(({ s, label }) => (
                          <div key={s} className="flex items-center gap-2">
                            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border capitalize', statusStyles[s as PostStatus])}>
                              {s}
                            </span>
                            <span className="text-xs text-muted-foreground">{label}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground pt-2">
                        Click any post on the calendar to preview it here.
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Engagement Chart + Upload */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Engagement Chart */}
          <motion.div variants={slideUp} initial="hidden" animate="visible" transition={{ delay: 0.2 }} className="lg:col-span-2">
            <Card className="bg-card border-border rounded-xl">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-strawberry" />
                    <CardTitle className="text-sm font-nunito font-semibold">Engagement Over Time</CardTitle>
                  </div>
                  <SampleBadge />
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-52 w-full rounded-lg" />
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={engagementData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <defs>
                        <linearGradient id="likes-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#FF6987" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#FF6987" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="comments-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="shares-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#48C78E" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#48C78E" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="date" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="likes" name="Likes" stroke="#FF6987" fill="url(#likes-fill)" strokeWidth={2} isAnimationActive animationDuration={800} />
                      <Area type="monotone" dataKey="comments" name="Comments" stroke="#6366F1" fill="url(#comments-fill)" strokeWidth={1.5} isAnimationActive animationDuration={800} animationBegin={150} />
                      <Area type="monotone" dataKey="shares" name="Shares" stroke="#48C78E" fill="url(#shares-fill)" strokeWidth={1.5} isAnimationActive animationDuration={800} animationBegin={300} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
                <div className="flex items-center gap-4 mt-3 px-1">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="w-3 h-0.5 bg-[#FF6987] rounded-full" /> Likes
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="w-3 h-0.5 bg-[#6366F1] rounded-full" /> Comments
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="w-3 h-0.5 bg-[#48C78E] rounded-full" /> Shares
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Upload Zone */}
          <motion.div variants={slideUp} initial="hidden" animate="visible" transition={{ delay: 0.25 }}>
            <Card className="bg-card border-border rounded-xl h-full">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-strawberry" />
                  <CardTitle className="text-sm font-nunito font-semibold">Upload Media</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <DragDropZone />
                <p className="text-xs text-muted-foreground text-center mt-3">
                  Uploaded files go to Sierra to schedule and caption
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Recent Posts Grid */}
        <motion.div variants={slideUp} initial="hidden" animate="visible" transition={{ delay: 0.3 }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-nunito font-semibold text-foreground">Recent Posts</h2>
            <SampleBadge />
          </div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <Skeleton className="h-24 w-full rounded-lg" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              ))}
            </div>
          ) : (
            <motion.div variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {recentPosts.slice(0, 4).map((post) => (
                <motion.div key={post.id} variants={slideUp}>
                  <PostCard post={post} />
                </motion.div>
              ))}
            </motion.div>
          )}
        </motion.div>

      </div>
    </PageTransition>
  )
}
