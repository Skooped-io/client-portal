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

export interface SkoopedLogEntry {
  timestamp: string
  level: LogLevel
  agent: AgentName
  action: string
  status: LogStatus
  client_id?: string
  client_name?: string
  workflow?: string
  trace_id?: string
  span_id?: string
  duration_ms?: number
  tokens_used?: number
  model?: string
  metadata?: Record<string, unknown>
  error?: string
  error_category?: ErrorCategory
}

export type ErrorCategory =
  | 'api_error'
  | 'validation_error'
  | 'auth_error'
  | 'timeout'
  | 'rate_limit'
  | 'not_found'
  | 'permission_denied'
  | 'unknown'
