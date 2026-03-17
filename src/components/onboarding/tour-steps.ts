// Tour step configuration
// Each step spotlights a sidebar nav item identified by data-tour-id.

export interface TourStep {
  id: string
  /** Matches data-tour-id on the sidebar nav link */
  targetId: string
  title: string
  description: string
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'dashboard',
    targetId: 'tour-nav-dashboard',
    title: 'Your command center',
    description: 'Everything about your business at a glance — traffic, rankings, social posts, and your AI team working in real time.',
  },
  {
    id: 'seo',
    targetId: 'tour-nav-seo',
    title: 'SEO & rankings',
    description: 'We monitor your Google rankings and search performance here. Watch your keywords climb as Scout gets to work.',
  },
  {
    id: 'analytics',
    targetId: 'tour-nav-analytics',
    title: 'Real traffic data',
    description: 'Website visitors and search impressions pulled directly from Google Analytics and Search Console, updated daily.',
  },
  {
    id: 'ads',
    targetId: 'tour-nav-ads',
    title: 'Ads & leads',
    description: 'If you\'re running Google Ads, this is where you track spend, conversions, and return on every dollar.',
  },
  {
    id: 'social',
    targetId: 'tour-nav-social',
    title: 'Content & social',
    description: 'Your Instagram and Facebook content calendar, scheduled posts, and engagement — all managed by Sierra.',
  },
  {
    id: 'messages',
    targetId: 'tour-nav-messages',
    title: 'Talk to your team',
    description: 'Have a question or want to request something? Message your Skooped team directly right here.',
  },
]

export const TOUR_COMPLETE_STEP = {
  title: 'You\'re all set!',
  description: 'Your Skooped team is already working on your business. Check back anytime to see progress, review rankings, and stay in the loop.',
}
