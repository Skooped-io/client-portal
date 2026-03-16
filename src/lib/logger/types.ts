export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical'

export type AgentName =
  | 'cooper'
  | 'scout'
  | 'bob'
  | 'sierra'
  | 'riley'
  | 'mark'
  | 'sandra'
  | 'red'
  | 'system'

export type LogStatus = 'started' | 'completed' | 'failed' | 'skipped'

export type ErrorCategory =
  | 'api_error'
  | 'validation_error'
  | 'auth_error'
  | 'timeout'
  | 'rate_limit'
  | 'not_found'
  | 'permission_denied'
  | 'unknown'

export type ProjectRepo =
  | 'client-portal'
  | 'seo-engine'
  | 'content-engine'
  | 'reporting-engine'
  | 'security-tools'
  | 'finops-tools'
  | 'infrastructure'
  | 'website-templates'

export type Workflow =
  | 'onboarding'
  | 'monthly_cycle'
  | 'website_build'
  | 'content_pipeline'
  | 'ad_campaign'
  | 'security_audit'
  | 'reporting'
  | 'maintenance'
  | 'internal'

export interface SkoopedLogEntry {
  // when
  timestamp: string

  // what
  level: LogLevel
  action: string
  status: LogStatus

  // who
  agent: AgentName

  // which client
  client_id?: string
  client_name?: string

  // which project (GitHub)
  project_repo?: ProjectRepo
  issue_number?: number
  issue_url?: string
  branch?: string

  // which workflow
  workflow?: Workflow
  trace_id?: string
  span_id?: string

  // performance
  duration_ms?: number
  tokens_used?: number
  model?: string

  // errors
  error?: string
  error_category?: ErrorCategory

  // anything else
  metadata?: Record<string, unknown>
}

/** Context object for passing client + project info through a workflow */
export interface WorkContext {
  client_id: string
  client_name: string
  project_repo?: ProjectRepo
  issue_number?: number
  workflow?: Workflow
  trace_id?: string
}
