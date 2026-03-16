import { Axiom } from '@axiomhq/js'
import type { AgentName, ErrorCategory, LogLevel, LogStatus, SkoopedLogEntry } from './types'

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

export const logger = {
  info: (agent: AgentName, action: string, status: LogStatus, options?: Partial<SkoopedLogEntry>) => {
    const entry = createEntry('info', agent, action, status, options)
    axiom.ingest(DATASET, [entry])
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${entry.agent}] ${entry.action} — ${entry.status}`, options?.metadata ?? '')
    }
    return entry
  },

  warn: (agent: AgentName, action: string, status: LogStatus, options?: Partial<SkoopedLogEntry>) => {
    const entry = createEntry('warn', agent, action, status, options)
    axiom.ingest(DATASET, [entry])
    console.warn(`[${entry.agent}] ⚠️ ${entry.action} — ${entry.status}`, options?.metadata ?? '')
    return entry
  },

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

  debug: (agent: AgentName, action: string, status: LogStatus, options?: Partial<SkoopedLogEntry>) => {
    if (process.env.NODE_ENV !== 'development') return
    const entry = createEntry('debug', agent, action, status, options)
    axiom.ingest(DATASET, [entry])
    console.debug(`[${entry.agent}] 🔍 ${entry.action} — ${entry.status}`)
    return entry
  },

  /** Track an LLM / AI call with token usage and cost */
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

  /** Flush all pending logs — call this before process exit or in API route cleanup */
  flush: async () => {
    await axiom.flush()
  },
}

export type { AgentName, ErrorCategory, LogLevel, LogStatus, SkoopedLogEntry }
