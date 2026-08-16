/** Worker environment bindings shared by the Worker and both DO classes. */
export interface RippleEnv {
  STORE: R2Bucket;
  TRANSACTOR: DurableObjectNamespace;
  REPLICA: DurableObjectNamespace;
  /** stage name (dev / prod) */
  RIPPLE_STAGE?: string;
  /** JSON map { "<db>": "<token>" } or a single admin token; empty = auth disabled */
  RIPPLE_TOKENS?: string;
  /** indexer tuning */
  RIPPLE_INDEX_INTERVAL_MS?: string;
  RIPPLE_INDEX_TX_THRESHOLD?: string;
  RIPPLE_INDEX_MAX_TXS_PER_RUN?: string;
  RIPPLE_LOG_KEEP_TXS?: string;
  RIPPLE_GC_EVERY_N_INDEXES?: string;
  RIPPLE_RETAIN_ROOTS?: string;
  /** group commit: max txs per storage write (0 = unbounded) */
  RIPPLE_MAX_BATCH?: string;
  /** query memory guardrail: max intermediate cells (rows × columns) per query */
  RIPPLE_QUERY_MAX_CELLS?: string;
}

export function envInt(v: string | undefined, dflt: number): number {
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : dflt;
}
