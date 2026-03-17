// ===== Bot Activity Types =====

export type AgentId = 'scout' | 'bob' | 'sierra' | 'riley' | 'cooper'

export type ActionType =
  | 'seo_scan'
  | 'analytics_report'
  | 'social_scheduled'
  | 'website_health'
  | 'review_detected'
  | 'keyword_improved'
  | 'website_deployed'
  | 'team_message'

export interface BotActivity {
  id: string
  org_id: string
  agent: AgentId
  action_type: ActionType
  title: string
  description: string
  metadata?: Record<string, unknown>
  read: boolean
  created_at: string
}

// ===== Action type config =====

export const ACTION_CONFIG: Record<ActionType, { icon: string; label: string }> = {
  seo_scan:         { icon: '🔍', label: 'SEO scan' },
  analytics_report: { icon: '📊', label: 'Analytics' },
  social_scheduled: { icon: '📱', label: 'Social' },
  website_health:   { icon: '🌐', label: 'Website' },
  review_detected:  { icon: '⭐', label: 'Review' },
  keyword_improved: { icon: '📈', label: 'Keyword' },
  website_deployed: { icon: '🔧', label: 'Deploy' },
  team_message:     { icon: '💬', label: 'Message' },
}

// ===== Agent config =====

export const AGENT_CONFIG: Record<AgentId, { name: string; color: string; bg: string; initials: string }> = {
  scout:  { name: 'Scout',  color: '#5B8DEF', bg: 'rgba(91,141,239,0.12)',  initials: 'SC' },
  bob:    { name: 'Bob',    color: '#E8C87A', bg: 'rgba(232,200,122,0.12)', initials: 'BO' },
  sierra: { name: 'Sierra', color: '#C99035', bg: 'rgba(201,144,53,0.12)',  initials: 'SI' },
  riley:  { name: 'Riley',  color: '#4CAF50', bg: 'rgba(76,175,80,0.12)',   initials: 'RI' },
  cooper: { name: 'Cooper', color: '#D94A7A', bg: 'rgba(217,74,122,0.15)',  initials: 'CO' },
}

// ===== Helper =====

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString()
}

function minutesAgo(m: number): string {
  return new Date(Date.now() - m * 60 * 1000).toISOString()
}

// ===== Demo data =====
// Structured for future Supabase `bot_activity` table.

export const DEMO_BOT_ACTIVITIES: BotActivity[] = [
  {
    id: 'ba-001',
    org_id: 'demo-org',
    agent: 'scout',
    action_type: 'seo_scan',
    title: 'SEO scan completed',
    description: 'Scanned 48 target keywords. "garage door repair franklin tn" moved from position 7 → 4. Local pack visibility up 12%.',
    metadata: { keywords_scanned: 48, improvements: 11, drops: 2, top_keyword: 'garage door repair franklin tn' },
    read: false,
    created_at: minutesAgo(14),
  },
  {
    id: 'ba-002',
    org_id: 'demo-org',
    agent: 'sierra',
    action_type: 'social_scheduled',
    title: '3 posts scheduled for this week',
    description: 'Monday, Wednesday, and Friday posts queued on Instagram. Content: project showcase, before/after, and seasonal promo.',
    metadata: { posts: 3, platform: 'instagram', days: 'Mon, Wed, Fri' },
    read: false,
    created_at: minutesAgo(47),
  },
  {
    id: 'ba-003',
    org_id: 'demo-org',
    agent: 'scout',
    action_type: 'keyword_improved',
    title: 'Keyword ranking improved',
    description: '"emergency garage repair" climbed from position 14 to position 6 this week. Estimated +18 clicks/month.',
    metadata: { keyword: 'emergency garage repair', old_position: 14, new_position: 6, est_clicks_gain: 18 },
    read: false,
    created_at: hoursAgo(2),
  },
  {
    id: 'ba-004',
    org_id: 'demo-org',
    agent: 'riley',
    action_type: 'analytics_report',
    title: 'Monthly analytics report generated',
    description: 'March 2026 report compiled with GA4, Google Search Console, and Google Business Profile data. 1,842 website sessions (+22% vs Feb).',
    metadata: { period: 'March 2026', sessions: 1842, sessions_change_pct: 22, source: 'GA4 + GSC + GBP' },
    read: true,
    created_at: hoursAgo(3),
  },
  {
    id: 'ba-005',
    org_id: 'demo-org',
    agent: 'scout',
    action_type: 'review_detected',
    title: 'New 5-star Google review detected',
    description: 'Sarah M. left a 5-star review: "Fast, professional service. Had my door fixed same day. Highly recommend!" — responded within 2 hours.',
    metadata: { stars: 5, reviewer: 'Sarah M.', response_time_hours: 2 },
    read: true,
    created_at: hoursAgo(5),
  },
  {
    id: 'ba-006',
    org_id: 'demo-org',
    agent: 'bob',
    action_type: 'website_deployed',
    title: 'Website update deployed',
    description: 'Service page copy updated with new seasonal pricing. New "Emergency Services" section added above the fold. Pagespeed +4 points.',
    metadata: { pages_updated: 2, pagespeed_delta: 4 },
    read: true,
    created_at: hoursAgo(8),
  },
  {
    id: 'ba-007',
    org_id: 'demo-org',
    agent: 'bob',
    action_type: 'website_health',
    title: 'Website health check passed',
    description: 'All 12 pages crawled. No broken links, no missing meta tags, SSL valid, uptime 99.97%. Core Web Vitals: LCP 1.8s, CLS 0.04.',
    metadata: { pages: 12, broken_links: 0, uptime_pct: 99.97, lcp_seconds: 1.8, cls: 0.04 },
    read: true,
    created_at: hoursAgo(12),
  },
  {
    id: 'ba-008',
    org_id: 'demo-org',
    agent: 'cooper',
    action_type: 'team_message',
    title: 'Message from your Skooped team',
    description: 'Hi! We noticed your Google Ads CTR improved to 4.7% this week — great momentum. We\'re testing a new ad variation targeting "same day service." Check Ads tab for details.',
    metadata: { ctr: 4.7, new_variation: 'same day service' },
    read: true,
    created_at: hoursAgo(18),
  },
  {
    id: 'ba-009',
    org_id: 'demo-org',
    agent: 'scout',
    action_type: 'seo_scan',
    title: 'Google Business Profile updated',
    description: 'Added 4 new service keywords to your GBP listing. Business hours verified. Photo count now at 23 (recommended: 25+).',
    metadata: { keywords_added: 4, photos: 23, hours_verified: true },
    read: true,
    created_at: hoursAgo(24),
  },
  {
    id: 'ba-010',
    org_id: 'demo-org',
    agent: 'sierra',
    action_type: 'social_scheduled',
    title: 'Facebook post published',
    description: '"Spring special: $50 off garage door tune-ups through April 30" — reached 312 people organically within 6 hours.',
    metadata: { platform: 'facebook', reach: 312, hours_since_post: 6 },
    read: true,
    created_at: hoursAgo(30),
  },
  {
    id: 'ba-011',
    org_id: 'demo-org',
    agent: 'riley',
    action_type: 'analytics_report',
    title: 'Weekly traffic summary',
    description: 'Week of Mar 10–16: 428 sessions, 67 lead form views, 14 phone call clicks, 3 contact form submissions. Best day: Tuesday.',
    metadata: { sessions: 428, lead_form_views: 67, phone_clicks: 14, form_submissions: 3 },
    read: true,
    created_at: hoursAgo(36),
  },
  {
    id: 'ba-012',
    org_id: 'demo-org',
    agent: 'scout',
    action_type: 'keyword_improved',
    title: '3 keywords entered top 10',
    description: '"garage door spring replacement," "garage opener repair near me," and "commercial garage door service" all moved into positions 6–9 this week.',
    metadata: { keywords_entered_top10: 3, average_position: 7.3 },
    read: true,
    created_at: hoursAgo(48),
  },
  {
    id: 'ba-013',
    org_id: 'demo-org',
    agent: 'bob',
    action_type: 'website_health',
    title: 'Uptime alert — resolved',
    description: 'Brief 4-minute outage detected at 2:17 AM (hosting maintenance window). Site fully recovered. No impact on business hours.',
    metadata: { outage_minutes: 4, time: '2:17 AM', cause: 'hosting maintenance' },
    read: true,
    created_at: hoursAgo(60),
  },
  {
    id: 'ba-014',
    org_id: 'demo-org',
    agent: 'scout',
    action_type: 'review_detected',
    title: '4-star Google review',
    description: 'James T. left 4 stars: "Good service, tech was knowledgeable. Slight delay on arrival but fixed quickly." Responded with appreciation.',
    metadata: { stars: 4, reviewer: 'James T.' },
    read: true,
    created_at: hoursAgo(72),
  },
  {
    id: 'ba-015',
    org_id: 'demo-org',
    agent: 'sierra',
    action_type: 'social_scheduled',
    title: '5 posts scheduled for next two weeks',
    description: 'Content calendar filled through March 30. Mix of educational tips, project spotlights, and a customer testimonial video post.',
    metadata: { posts: 5, platforms: 'instagram, facebook', period: 'Mar 17–30' },
    read: true,
    created_at: hoursAgo(96),
  },
]
