import type { AnalyticsEngineDatasetLike } from "./observability.ts";

/** Worker environment bindings shared by the Worker and both DO classes. */
export interface RippleEnv {
  STORE: R2Bucket;
  TRANSACTOR: DurableObjectNamespace;
  REPLICA: DurableObjectNamespace;
  /** optional Analytics Engine dataset for write-path + http metrics; unbound = metrics off */
  ANALYTICS?: AnalyticsEngineDatasetLike;
  /** stage name (dev / prod) */
  RIPPLE_STAGE?: string;
  /** one shared bearer token, checked for every database name; empty = auth disabled */
  RIPPLE_TOKEN?: string;
  /** indexer tuning */
  RIPPLE_INDEX_INTERVAL_MS?: string;
  RIPPLE_INDEX_TX_THRESHOLD?: string;
  RIPPLE_INDEX_MAX_TXS_PER_RUN?: string;
  RIPPLE_LOG_KEEP_TXS?: string;
  RIPPLE_GC_EVERY_N_INDEXES?: string;
  RIPPLE_RETAIN_ROOTS?: string;
  /** group commit: max txs per storage write (0 = unbounded) */
  RIPPLE_MAX_BATCH?: string;
  /** "1" = timing fences in the commit loop (diagnostics; Workers clock only advances across I/O) */
  RIPPLE_TIMING_YIELDS?: string;
  /** query memory guardrail: max intermediate cells (rows × columns) per query */
  RIPPLE_QUERY_MAX_CELLS?: string;
  /** structured log level for all components: debug | info | warn | error (default info) */
  RIPPLE_LOG_LEVEL?: string;
  /** Worker read-path defaults (each overridable per request by header, see packages/worker/src/peer.ts) */
  /** default replica location hint: wnam|enam|…|auto (auto = colo→hint); unset = continent default */
  RIPPLE_REPLICA_HINT?: string;
  /** "1" = isolate basis cache on by default */
  RIPPLE_CACHE_BASIS?: string;
  /** default basis-cache consistency mode: ttl | peer */
  RIPPLE_CACHE_MODE?: string;
}

export function envInt(v: string | undefined, dflt: number): number {
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : dflt;
}
