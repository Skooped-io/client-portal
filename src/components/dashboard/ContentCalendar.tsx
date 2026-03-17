'use client'

import { motion } from 'framer-motion'
import { Instagram, Facebook, Chrome } from 'lucide-react'
import { staggerSlow, slideUp } from '@/lib/animations/variants'
import { cn } from '@/lib/utils'

type PostStatus = 'scheduled' | 'posted' | 'draft'
type Platform = 'instagram' | 'facebook' | 'google'

interface ScheduledPost {
  platform: Platform
  status: PostStatus
  caption?: string
}

interface CalendarDay {
  date: Date
  posts: ScheduledPost[]
}

const PLATFORM_ICONS: Record<Platform, React.FC<{ className?: string }>> = {
  instagram: ({ className }) => <Instagram className={className} />,
  facebook: ({ className }) => <Facebook className={className} />,
  google: ({ className }) => <Chrome className={className} />,
}

const PLATFORM_COLORS: Record<Platform, string> = {
  instagram: 'text-[#E1306C]',
  facebook: 'text-[#1877F2]',
  google: 'text-[#4285F4]',
}

const STATUS_STYLES: Record<PostStatus, string> = {
  scheduled: 'bg-mint/15 text-mint border-mint/20',
  posted: 'bg-strawberry/15 text-strawberry border-strawberry/20',
  draft: 'bg-muted/60 text-muted-foreground border-border',
}

const STATUS_LABELS: Record<PostStatus, string> = {
  scheduled: 'Scheduled',
  posted: 'Posted',
  draft: 'Draft',
}

// Generate demo data for the next 7 days
function getDemoCalendar(): CalendarDay[] {
  const platforms: Platform[] = ['instagram', 'facebook', 'google']
  const statuses: PostStatus[] = ['scheduled', 'posted', 'draft']

  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() + i)

    const numPosts = i === 0 ? 0 : Math.floor(Math.random() * 3)
    const posts: ScheduledPost[] = Array.from({ length: numPosts }, (_, j) => ({
      platform: platforms[j % platforms.length],
      status: i < 2 ? 'posted' : i < 5 ? 'scheduled' : statuses[Math.floor(Math.random() * 3)],
    }))

    return { date, posts }
  })
}

const DEMO_DAYS = getDemoCalendar()

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface ContentCalendarProps {
  days?: CalendarDay[]
  isDemo?: boolean
  className?: string
}

export function ContentCalendar({ days, isDemo, className }: ContentCalendarProps) {
  const calendarDays = days ?? DEMO_DAYS
  const showDemo = isDemo ?? !days

  return (
    <div id="content-calendar" className={cn('w-full', className)}>
      {showDemo && (
        <div className="flex items-center gap-2 mb-3">
          <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-muted/60 border border-border text-muted-foreground">
            Sample data
          </span>
          <span className="text-xs text-muted-foreground">
            Connect your social accounts to see your real calendar
          </span>
        </div>
      )}

      <motion.div
        className="grid grid-cols-7 gap-2"
        variants={staggerSlow}
        initial="hidden"
        animate="visible"
      >
        {calendarDays.map((day, i) => {
          const isToday = i === 0
          const dayLabel = DAY_LABELS[day.date.getDay()]
          const dateNum = day.date.getDate()
          const monthLabel = MONTH_LABELS[day.date.getMonth()]

          return (
            <motion.div
              key={i}
              variants={slideUp}
              className={cn(
                'rounded-xl border p-2.5 flex flex-col gap-2 min-h-[100px] transition-colors',
                isToday
                  ? 'border-strawberry/40 bg-strawberry/5'
                  : 'border-border bg-card hover:bg-card-hover'
              )}
            >
              {/* Day header */}
              <div className="text-center">
                <p className={cn('text-[10px] font-medium uppercase', isToday ? 'text-strawberry' : 'text-muted-foreground')}>
                  {dayLabel}
                </p>
                <p className={cn('text-sm font-bold leading-none mt-0.5', isToday ? 'text-strawberry' : 'text-foreground')}>
                  {dateNum}
                </p>
                <p className="text-[9px] text-muted-foreground">{monthLabel}</p>
              </div>

              {/* Posts */}
              <div className="flex flex-col gap-1 flex-1">
                {day.posts.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <span className="text-[9px] text-muted-foreground/50">—</span>
                  </div>
                ) : (
                  day.posts.map((post, j) => {
                    const PlatformIcon = PLATFORM_ICONS[post.platform]
                    return (
                      <div
                        key={j}
                        className={cn(
                          'flex items-center gap-1 px-1.5 py-1 rounded-md border text-[9px] font-medium',
                          STATUS_STYLES[post.status]
                        )}
                      >
                        <PlatformIcon className={cn('w-2.5 h-2.5 shrink-0', PLATFORM_COLORS[post.platform])} />
                        <span className="truncate">{STATUS_LABELS[post.status]}</span>
                      </div>
                    )
                  })
                )}
              </div>
            </motion.div>
          )
        })}
      </motion.div>
    </div>
  )
}
