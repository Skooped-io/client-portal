/**
 * Data access layer — all Supabase queries for dashboard pages.
 *
 * Each module exports typed query functions that read from metric tables.
 * All functions use the current user's org (via getCurrentOrgId).
 * Service role key (used by cron/agents) bypasses RLS.
 *
 * Usage in server components:
 *   import { getSeoOverview } from '@/lib/data/seo'
 *   const seo = await getSeoOverview()
 */

export { getSeoOverview, getTopQueries } from './seo'
export type { SeoSnapshot, SeoOverview } from './seo'

export { getAnalyticsOverview } from './analytics'
export type { AnalyticsSnapshot, AnalyticsOverview } from './analytics'

export { getAdsOverview } from './ads'
export type { AdsSnapshot, AdsOverview } from './ads'

export { getGbpOverview } from './gbp'
export type { GbpSnapshot, GbpOverview } from './gbp'

export { getSocialOverview } from './social'
export type { SocialSnapshot, SocialOverview } from './social'

export { getAgentActivity } from './activity'
export type { AgentActivityRow } from './activity'

export { getLatestDeployment, getDeploymentHistory } from './deployments'
export type { DeploymentRow } from './deployments'

export { getReports } from './reports'
export type { ReportRow } from './reports'
