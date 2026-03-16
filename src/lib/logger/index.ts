import { Axiom } from '@axiomhq/js'
import { DATASETS } from './datasets'
import type {
  AgentName,
  ErrorCategory,
  LogLevel,
  LogStatus,
  ProjectRepo,
  SkoopedLogEntry,
  WorkContext,
  Workflow,
} from './types'

const axiom = new Axiom({
  token: process.env.AXIOM_TOKEN ?? '',
  orgId: process.env.AXIOM_ORG_ID ?? '',
})

const send = (dataset: string, entry: Record<string, unknown>) => {
  axiom.ingest(dataset, [entry])
}

const ts = () => new Date().toISOString()

const issueUrl = (repo: ProjectRepo, num: number): string =>
  `https://github.com/Skooped-io/${repo}/issues/${num}`

// ============================================
// OPS LOGGER — agent team activity
// → skooped-ops dataset
// ============================================

export const ops = {
  /** Log an agent action */
  info: (agent: AgentName, action: string, status: LogStatus, options?: Partial<SkoopedLogEntry>) => {
    const entry = { timestamp: ts(), level: 'info', agent, action, status, ...options }
    send(DATASETS.ops, entry)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[ops][${agent}] ${action} — ${status}`)
    }
    return entry
  },

  warn: (agent: AgentName, action: string, status: LogStatus, options?: Partial<SkoopedLogEntry>) => {
    const entry = { timestamp: ts(), level: 'warn', agent, action, status, ...options }
    send(DATASETS.ops, entry)
    console.warn(`[ops][${agent}] ⚠️ ${action} — ${status}`)
    return entry
  },

  error: (agent: AgentName, action: string, error: string, category: ErrorCategory = 'unknown', options?: Partial<SkoopedLogEntry>) => {
    const entry = { timestamp: ts(), level: 'error', agent, action, status: 'failed', error, error_category: category, ...options }
    send(DATASETS.ops, entry)
    console.error(`[ops][${agent}] 🔴 ${action} — ${error}`)
    return entry
  },

  /** Log a project-scoped agent task with full context */
  task: (agent: AgentName, action: string, status: LogStatus, context: WorkContext, options?: Partial<SkoopedLogEntry>) => {
    const entry = {
      timestamp: ts(),
      level: 'info',
      agent,
      action,
      status,
      client_id: context.client_id,
      client_name: context.client_name,
      project_repo: context.project_repo,
      issue_number: context.issue_number,
      issue_url: context.project_repo && context.issue_number
        ? issueUrl(context.project_repo, context.issue_number)
        : undefined,
      workflow: context.workflow,
      trace_id: context.trace_id,
      ...options,
    }
    send(DATASETS.ops, entry)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[ops][${agent}] ${action} — ${status} | ${context.client_name} #${context.issue_number}`)
    }
    return entry
  },

  /** Track LLM / AI token usage */
  llm: (agent: AgentName, action: string, model: string, tokensUsed: number, durationMs: number, options?: Partial<SkoopedLogEntry>) => {
    const entry = { timestamp: ts(), level: 'info', agent, action, status: 'completed', model, tokens_used: tokensUsed, duration_ms: durationMs, ...options }
    send(DATASETS.ops, entry)
    return entry
  },
}

// ============================================
// CLIENT LOGGER — business metrics and data
// → skooped-clients dataset
// ============================================

export interface ClientMetric {
  timestamp: string
  client_id: string
  client_name: string
  metric_type: string
  source: string
  data: Record<string, unknown>
}

export const clients = {
  /** Log a client business metric (SEO, ads, content, etc) */
  metric: (clientId: string, clientName: string, metricType: string, source: string, data: Record<string, unknown>) => {
    const entry: ClientMetric = {
      timestamp: ts(),
      client_id: clientId,
      client_name: clientName,
      metric_type: metricType,
      source,
      data,
    }
    send(DATASETS.clients, entry)
    return entry
  },

  /** Log a client SEO data pull */
  seo: (clientId: string, clientName: string, data: Record<string, unknown>) => {
    return clients.metric(clientId, clientName, 'seo', 'google_search_console', data)
  },

  /** Log client ad performance */
  ads: (clientId: string, clientName: string, data: Record<string, unknown>) => {
    return clients.metric(clientId, clientName, 'ads', 'google_ads', data)
  },

  /** Log client content engagement */
  content: (clientId: string, clientName: string, data: Record<string, unknown>) => {
    return clients.metric(clientId, clientName, 'content', 'meta_api', data)
  },

  /** Log client GBP metrics */
  gbp: (clientId: string, clientName: string, data: Record<string, unknown>) => {
    return clients.metric(clientId, clientName, 'gbp', 'google_business_profile', data)
  },
}

// ============================================
// PORTAL LOGGER — app-level events
// → skooped-portal dataset
// ============================================

export interface PortalEvent {
  timestamp: string
  level: LogLevel
  action: string
  status: LogStatus
  user_id?: string
  path?: string
  method?: string
  status_code?: number
  duration_ms?: number
  error?: string
  metadata?: Record<string, unknown>
}

export const portal = {
  /** Log an app-level event (auth, API call, etc) */
  event: (action: string, status: LogStatus, options?: Partial<PortalEvent>) => {
    const entry: PortalEvent = { timestamp: ts(), level: 'info', action, status, ...options }
    send(DATASETS.portal, entry)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[portal] ${action} — ${status}`)
    }
    return entry
  },

  /** Log an API route call */
  api: (method: string, path: string, statusCode: number, durationMs: number, options?: Partial<PortalEvent>) => {
    const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'
    const status: LogStatus = statusCode >= 400 ? 'failed' : 'completed'
    const entry: PortalEvent = { timestamp: ts(), level, action: 'api.request', status, method, path, status_code: statusCode, duration_ms: durationMs, ...options }
    send(DATASETS.portal, entry)
    return entry
  },

  /** Log an auth event */
  auth: (action: string, status: LogStatus, userId?: string, options?: Partial<PortalEvent>) => {
    const entry: PortalEvent = { timestamp: ts(), level: status === 'failed' ? 'warn' : 'info', action: `auth.${action}`, status, user_id: userId, ...options }
    send(DATASETS.portal, entry)
    return entry
  },

  /** Log an error */
  error: (action: string, error: string, options?: Partial<PortalEvent>) => {
    const entry: PortalEvent = { timestamp: ts(), level: 'error', action, status: 'failed', error, ...options }
    send(DATASETS.portal, entry)
    console.error(`[portal] 🔴 ${action} — ${error}`)
    return entry
  },
}

// ============================================
// FLUSH — call before process exit
// ============================================

export const flush = async () => {
  await axiom.flush()
}

// ============================================
// LEGACY COMPAT — default export for existing code
// ============================================

export const logger = {
  ...ops,
  flush,
}

export type {
  AgentName,
  ErrorCategory,
  LogLevel,
  LogStatus,
  ProjectRepo,
  SkoopedLogEntry,
  WorkContext,
  Workflow,
}
