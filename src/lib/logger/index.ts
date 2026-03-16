import { Axiom } from '@axiomhq/js'
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

const DATASET = process.env.AXIOM_DATASET ?? 'skooped-dev'

const createEntry = (
  level: LogLevel,
  agent: AgentName,
  action: string,
  status: LogStatus,
  options?: Partial<Omit<SkoopedLogEntry, 'timestamp' | 'level' | 'agent' | 'action' | 'status'>>,
): SkoopedLogEntry => ({
  timestamp: new Date().toISOString(),
  level,
  agent,
  action,
  status,
  ...options,
})

/** Generate a GitHub issue URL from repo + issue number */
const issueUrl = (repo: ProjectRepo, issueNumber: number): string =>
  `https://github.com/Skooped-io/${repo}/issues/${issueNumber}`

export const logger = {
  /** Standard info log */
  info: (
    agent: AgentName,
    action: string,
    status: LogStatus,
    options?: Partial<SkoopedLogEntry>,
  ) => {
    const entry = createEntry('info', agent, action, status, options)
    axiom.ingest(DATASET, [entry])
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${entry.agent}] ${entry.action} — ${entry.status}`, options?.metadata ?? '')
    }
    return entry
  },

  /** Warning — something is off but not broken */
  warn: (
    agent: AgentName,
    action: string,
    status: LogStatus,
    options?: Partial<SkoopedLogEntry>,
  ) => {
    const entry = createEntry('warn', agent, action, status, options)
    axiom.ingest(DATASET, [entry])
    console.warn(`[${entry.agent}] ⚠️ ${entry.action} — ${entry.status}`, options?.metadata ?? '')
    return entry
  },

  /** Error — something broke */
  error: (
    agent: AgentName,
    action: string,
    error: string,
    category: ErrorCategory = 'unknown',
    options?: Partial<SkoopedLogEntry>,
  ) => {
    const entry = createEntry('error', agent, action, 'failed', {
      error,
      error_category: category,
      ...options,
    })
    axiom.ingest(DATASET, [entry])
    console.error(`[${entry.agent}] 🔴 ${entry.action} — ${error}`)
    return entry
  },

  /** Critical — everything is on fire */
  critical: (
    agent: AgentName,
    action: string,
    error: string,
    category: ErrorCategory = 'unknown',
    options?: Partial<SkoopedLogEntry>,
  ) => {
    const entry = createEntry('critical', agent, action, 'failed', {
      error,
      error_category: category,
      ...options,
    })
    axiom.ingest(DATASET, [entry])
    console.error(`[${entry.agent}] 🚨 CRITICAL: ${entry.action} — ${error}`)
    return entry
  },

  /** Debug — dev only */
  debug: (
    agent: AgentName,
    action: string,
    status: LogStatus,
    options?: Partial<SkoopedLogEntry>,
  ) => {
    if (process.env.NODE_ENV !== 'development') return
    const entry = createEntry('debug', agent, action, status, options)
    axiom.ingest(DATASET, [entry])
    console.debug(`[${entry.agent}] 🔍 ${entry.action} — ${entry.status}`)
    return entry
  },

  /** Track an LLM / AI call with token usage */
  llm: (
    agent: AgentName,
    action: string,
    model: string,
    tokensUsed: number,
    durationMs: number,
    options?: Partial<SkoopedLogEntry>,
  ) => {
    const entry = createEntry('info', agent, action, 'completed', {
      model,
      tokens_used: tokensUsed,
      duration_ms: durationMs,
      ...options,
    })
    axiom.ingest(DATASET, [entry])
    return entry
  },

  /**
   * Log with full project context — use this for client/project work
   *
   * @example
   * const ctx: WorkContext = {
   *   client_id: 'uuid',
   *   client_name: 'gunnsfencing',
   *   project_repo: 'seo-engine',
   *   issue_number: 42,
   *   workflow: 'monthly_cycle',
   *   trace_id: 'trace-abc123',
   * }
   * logger.task('scout', 'seo.audit.keywords', 'completed', ctx, { duration_ms: 4500 })
   */
  task: (
    agent: AgentName,
    action: string,
    status: LogStatus,
    context: WorkContext,
    options?: Partial<SkoopedLogEntry>,
  ) => {
    const entry = createEntry('info', agent, action, status, {
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
    })
    axiom.ingest(DATASET, [entry])
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[${entry.agent}] ${entry.action} — ${entry.status} | client:${context.client_name} issue:#${context.issue_number}`,
      )
    }
    return entry
  },

  /** Flush all pending logs — call before process exit or in API route cleanup */
  flush: async () => {
    await axiom.flush()
  },
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
