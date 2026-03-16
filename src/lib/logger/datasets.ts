/**
 * Axiom Dataset Routing
 *
 * 3 datasets, 3 purposes:
 *
 * skooped-ops     → agent activity, cron jobs, heartbeats, CI/CD
 *                   WHO did WHAT for WHICH client on WHICH issue
 *
 * skooped-clients → client business data: SEO metrics, ad performance,
 *                   content engagement, report snapshots
 *                   No agent names — this is business data, not team activity
 *
 * skooped-portal  → app-level logs: auth, API calls, page loads, errors
 *                   No agent names — this is the software working or failing
 */

export const DATASETS = {
  /** Agent team operations — who did what */
  ops: process.env.AXIOM_DATASET_OPS ?? 'skooped-ops',

  /** Client business metrics — SEO, ads, content, rankings */
  clients: process.env.AXIOM_DATASET_CLIENTS ?? 'skooped-clients',

  /** Portal app logs — auth, API, errors, performance
   *  Falls back to ops dataset if portal dataset unavailable (free tier limit) */
  portal: process.env.AXIOM_DATASET_PORTAL ?? 'skooped-ops',
} as const

export type DatasetName = keyof typeof DATASETS
