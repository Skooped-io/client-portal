'use client'

import { motion } from 'framer-motion'
import { Heart, Instagram, MessageCircle, Share2, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageTransition } from '@/components/motion/PageTransition'
import { stagger, slideUp } from '@/lib/animations/variants'
import { ChartWrapper, AreaChartBranded, BarChartBranded, LineChartBranded } from '@/components/charts'
import { chartColors } from '@/lib/chart-theme'
import {
  generateSocialData,
  generateFollowerData,
  postPerformance,
} from '@/lib/chart-demo-data'

const SOCIAL_DATA   = generateSocialData(14)
const FOLLOWER_DATA = generateFollowerData(12)

function SampleBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border">
      Sample data
    </span>
  )
}

export default function SocialPage() {
  const lastWeek = SOCIAL_DATA.slice(-7)
  const totalLikes    = lastWeek.reduce((a, b) => a + b.likes, 0)
  const totalComments = lastWeek.reduce((a, b) => a + b.comments, 0)
  const totalShares   = lastWeek.reduce((a, b) => a + b.shares, 0)
  const totalReach    = lastWeek.reduce((a, b) => a + b.reach, 0)
  const latestFollowers = FOLLOWER_DATA[FOLLOWER_DATA.length - 1]?.followers ?? 0

  return (
    <PageTransition>
      <div className="px-4 py-6 md:px-6 md:py-8 lg:px-8 max-w-7xl mx-auto space-y-4 md:space-y-6">

        {/* Header */}
        <motion.div variants={slideUp} initial="hidden" animate="visible" className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl sm:text-2xl font-nunito font-bold text-foreground">Social Media</h1>
              <SampleBadge />
            </div>
            <p className="text-muted-foreground text-sm">
              Engagement trends, follower growth, and post performance.
            </p>
          </div>
        </motion.div>

        {/* Stat Row */}
        <motion.div variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Followers',    value: latestFollowers.toLocaleString(), icon: Users,         color: 'text-strawberry' },
            { label: 'Likes (7d)',   value: totalLikes.toLocaleString(),      icon: Heart,         color: 'text-blueberry'  },
            { label: 'Comments (7d)',value: totalComments.toLocaleString(),   icon: MessageCircle, color: 'text-mint'       },
            { label: 'Reach (7d)',   value: totalReach.toLocaleString(),      icon: Share2,        color: 'text-vanilla'    },
          ].map((stat) => {
            const Icon = stat.icon
            return (
              <motion.div key={stat.label} variants={slideUp}>
                <Card className="bg-card border-border rounded-lg md:rounded-xl">
                  <CardContent className="p-4 md:p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
                        <p className="text-2xl font-nunito font-bold text-foreground">{stat.value}</p>
                      </div>
                      <div className={`p-2 rounded-lg bg-card-hover ${stat.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </motion.div>

        {/* Engagement Line Chart */}
        <ChartWrapper
          title="Engagement Trends"
          subtitle="Likes, comments & shares over 14 days"
          variant="strawberry"
          badge={<SampleBadge />}
          legend={[
            { label: 'Likes',    color: chartColors.strawberry },
            { label: 'Comments', color: chartColors.blueberry  },
            { label: 'Shares',   color: chartColors.mint       },
          ]}
        >
          <LineChartBranded
            data={SOCIAL_DATA}
            series={[
              { dataKey: 'likes',    label: 'Likes',    color: chartColors.strawberry },
              { dataKey: 'comments', label: 'Comments', color: chartColors.blueberry  },
              { dataKey: 'shares',   label: 'Shares',   color: chartColors.mint       },
            ]}
            xKey="date"
            height={220}
            xTickEvery={3}
            yTickFormatter={(v) => String(v)}
          />
        </ChartWrapper>

        {/* Follower Growth + Post Performance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">

          {/* Follower Growth Area Chart */}
          <ChartWrapper
            title="Follower Growth"
            subtitle="Cumulative followers over 12 weeks"
            variant="blueberry"
            badge={<SampleBadge />}
            legend={[{ label: 'Followers', color: chartColors.blueberry }]}
          >
            <AreaChartBranded
              data={FOLLOWER_DATA}
              series={[
                { dataKey: 'followers', label: 'Followers', color: chartColors.blueberry },
              ]}
              xKey="date"
              height={200}
              xTickEvery={3}
              yTickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
            />
          </ChartWrapper>

          {/* Post Performance Bar Chart */}
          <ChartWrapper
            title="Post Performance"
            subtitle="Engagement per post"
            variant="mint"
            badge={<SampleBadge />}
          >
            <BarChartBranded
              data={postPerformance}
              dataKey="engagement"
              label="Engagement"
              xKey="label"
              color={chartColors.mint}
              height={200}
              multiColor
            />
          </ChartWrapper>
        </div>

        {/* Weekly Gains Table */}
        <motion.div variants={slideUp} initial="hidden" animate="visible" transition={{ delay: 0.2 }}>
          <Card className="bg-card border-border rounded-xl">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Instagram className="w-4 h-4 text-strawberry" />
                  <CardTitle className="text-sm font-nunito font-semibold">Weekly New Followers</CardTitle>
                </div>
                <SampleBadge />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2 border-b border-border text-[10px] font-medium text-muted-foreground uppercase tracking-wider min-w-[320px]">
                  <span>Week</span>
                  <span className="text-right">New Followers</span>
                  <span className="text-right">Total</span>
                </div>
                {FOLLOWER_DATA.slice(-6).map((row) => (
                  <div
                    key={row.date}
                    className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-3 border-b border-border last:border-0 hover:bg-card-hover transition-colors min-w-[320px]"
                  >
                    <span className="text-sm text-foreground">{row.date}</span>
                    <span className="text-sm font-medium text-emerald-500 text-right tabular-nums">+{row.gained}</span>
                    <span className="text-sm text-muted-foreground text-right tabular-nums">{row.followers.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

      </div>
    </PageTransition>
  )
}
