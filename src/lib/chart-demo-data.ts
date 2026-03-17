// Realistic demo data generators for all portal chart sections

// ─── Traffic (30 days) ───────────────────────────────────────────────────────

export interface TrafficPoint {
  date: string
  visitors: number
  pageviews: number
  sessions: number
}

export function generateTrafficData(days = 30): TrafficPoint[] {
  const data: TrafficPoint[] = []
  let visitors = 280 + Math.random() * 80
  let pageviews = visitors * (2.1 + Math.random() * 0.6)
  let sessions = visitors * (1.15 + Math.random() * 0.15)

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    visitors  += (Math.random() - 0.38) * 45
    pageviews += (Math.random() - 0.36) * 90
    sessions  += (Math.random() - 0.38) * 30

    data.push({
      date:      label,
      visitors:  Math.max(40, Math.round(visitors)),
      pageviews: Math.max(80, Math.round(pageviews)),
      sessions:  Math.max(40, Math.round(sessions)),
    })
  }
  return data
}

// ─── Traffic Sources (donut) ──────────────────────────────────────────────────

export interface TrafficSource {
  name: string
  value: number
  color: string
}

export const trafficSources: TrafficSource[] = [
  { name: 'Organic Search', value: 42, color: '#D94A7A' },
  { name: 'Direct',         value: 24, color: '#5B8DEF' },
  { name: 'Referral',       value: 18, color: '#E8C87A' },
  { name: 'Social',         value: 10, color: '#4CAF50' },
  { name: 'Email',          value: 6,  color: '#C99035' },
]

// ─── Keyword Rankings ─────────────────────────────────────────────────────────

export interface KeywordPoint {
  date: string
  kw1: number
  kw2: number
  kw3: number
}

export function generateKeywordRankingData(weeks = 8): KeywordPoint[] {
  const data: KeywordPoint[] = []
  let kw1 = 8, kw2 = 14, kw3 = 22

  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i * 7)
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    kw1 = Math.max(1, Math.min(30, kw1 + (Math.random() - 0.55) * 2))
    kw2 = Math.max(1, Math.min(40, kw2 + (Math.random() - 0.50) * 2.5))
    kw3 = Math.max(1, Math.min(50, kw3 + (Math.random() - 0.48) * 3))

    data.push({ date: label, kw1: Math.round(kw1), kw2: Math.round(kw2), kw3: Math.round(kw3) })
  }
  return data
}

// ─── Organic Traffic (area) ───────────────────────────────────────────────────

export interface OrganicPoint {
  date: string
  impressions: number
  clicks: number
}

export function generateOrganicData(points = 12): OrganicPoint[] {
  const data: OrganicPoint[] = []
  let imp = 1200, clk = 88

  for (let i = points - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i * 7)
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    imp += (Math.random() - 0.35) * 180
    clk += (Math.random() - 0.35) * 14

    data.push({ date: label, impressions: Math.max(200, Math.round(imp)), clicks: Math.max(10, Math.round(clk)) })
  }
  return data
}

// ─── Ad Spend vs Conversions ──────────────────────────────────────────────────

export interface AdSpendPoint {
  date: string
  spend: number
  conversions: number
  cpc: number
}

export function generateAdSpendData(weeks = 8): AdSpendPoint[] {
  const data: AdSpendPoint[] = []
  let spend = 280, conv = 9

  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i * 7)
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    spend += (Math.random() - 0.3) * 60
    conv  += (Math.random() - 0.35) * 3
    const spendR = Math.max(100, Math.round(spend))
    const convR  = Math.max(2, Math.round(conv))

    data.push({ date: label, spend: spendR, conversions: convR, cpc: parseFloat((spendR / (convR * 8)).toFixed(2)) })
  }
  return data
}

// ─── CTR by Campaign ─────────────────────────────────────────────────────────

export interface CtrPoint {
  campaign: string
  ctr: number
  impressions: number
}

export const ctrByCampaign: CtrPoint[] = [
  { campaign: 'Vinyl Fencing', ctr: 11.6, impressions: 1840 },
  { campaign: 'Installation',  ctr: 9.8,  impressions: 1420 },
  { campaign: 'Wood Fencing',  ctr: 8.3,  impressions: 1180 },
  { campaign: 'Retargeting',   ctr: 7.1,  impressions: 920  },
  { campaign: 'Brand',         ctr: 5.0,  impressions: 680  },
]

// ─── Social Engagement ────────────────────────────────────────────────────────

export interface SocialPoint {
  date: string
  likes: number
  comments: number
  shares: number
  reach: number
}

export function generateSocialData(days = 14): SocialPoint[] {
  const data: SocialPoint[] = []
  let likes = 35, comments = 8, shares = 5, reach = 420

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    likes    += (Math.random() - 0.4) * 12
    comments += (Math.random() - 0.4) * 4
    shares   += (Math.random() - 0.4) * 3
    reach    += (Math.random() - 0.35) * 80

    data.push({
      date:     label,
      likes:    Math.max(5, Math.round(likes)),
      comments: Math.max(1, Math.round(comments)),
      shares:   Math.max(1, Math.round(shares)),
      reach:    Math.max(50, Math.round(reach)),
    })
  }
  return data
}

// ─── Follower Growth ──────────────────────────────────────────────────────────

export interface FollowerPoint {
  date: string
  followers: number
  gained: number
}

export function generateFollowerData(weeks = 12): FollowerPoint[] {
  const data: FollowerPoint[] = []
  let followers = 840

  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i * 7)
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    const gained = Math.max(1, Math.round(8 + (Math.random() - 0.3) * 10))
    followers += gained

    data.push({ date: label, followers, gained })
  }
  return data
}

// ─── Post Performance ─────────────────────────────────────────────────────────

export interface PostPerf {
  label: string
  engagement: number
  reach: number
}

export const postPerformance: PostPerf[] = [
  { label: 'Vinyl Install',  engagement: 312, reach: 1840 },
  { label: 'Before/After',   engagement: 487, reach: 2610 },
  { label: 'Team Spotlight', engagement: 198, reach: 1120 },
  { label: 'Spring Promo',   engagement: 553, reach: 3290 },
  { label: 'Tip Tuesday',    engagement: 276, reach: 1550 },
  { label: 'Project Reveal', engagement: 421, reach: 2380 },
]

// ─── Page Views / Bounce Rate ─────────────────────────────────────────────────

export interface PageViewPoint {
  date: string
  pageviews: number
  bounceRate: number
  avgSession: number
}

export function generatePageViewData(days = 14): PageViewPoint[] {
  const data: PageViewPoint[] = []
  let pv = 420, bounce = 52, avgSess = 138

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    pv      += (Math.random() - 0.38) * 60
    bounce  += (Math.random() - 0.50) * 4
    avgSess += (Math.random() - 0.45) * 12

    data.push({
      date:       label,
      pageviews:  Math.max(60, Math.round(pv)),
      bounceRate: parseFloat(Math.max(30, Math.min(75, bounce)).toFixed(1)),
      avgSession: Math.max(60, Math.round(avgSess)),
    })
  }
  return data
}

// ─── SEO Health Score ─────────────────────────────────────────────────────────

export const seoHealthScore = 75
