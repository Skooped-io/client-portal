export interface Organization {
  id: string
  name: string
  slug: string
  plan: string
  status: string
}

export interface OrganizationMember {
  org_id: string
  user_id: string
  role: string
}

export interface Profile {
  id: string
  full_name: string | null
  phone: string | null
  timezone: string | null
}

export interface BusinessProfile {
  org_id: string
  business_name: string
  industry: string | null
  services: string[] | null
  service_areas: string[] | null
  phone: string | null
  email: string | null
  website_url: string | null
  city: string | null
  state: string | null
  description: string | null
}

export interface AnalyticsDaily {
  org_id: string
  date: string
  sessions: number
  pageviews: number
  bounce_rate: number
}

export interface GscDaily {
  org_id: string
  date: string
  clicks: number
  impressions: number
  avg_position: number
}

export interface GbpDaily {
  org_id: string
  date: string
  phone_calls: number
  direction_requests: number
}

export interface GbpReview {
  org_id: string
  rating: number
  review_text: string | null
  reply_text: string | null
}

export interface Message {
  org_id: string
  sender_type: string
  content: string
}

export interface DashboardStats {
  sessions: number
  impressions: number
  phoneCalls: number
  reviewCount: number
}

export type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string }
