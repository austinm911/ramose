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
  /** shared bearer token: with no policy, unset = open and a match = admin; under a policy it is not a data-plane principal */
  RIPPLE_TOKEN?: string;
  /** compiled policy JSON (`SchemaFx.Policy.compile`). Its presence arms enforcement (fail closed). */
  RIPPLE_POLICY?: string;
  /** JWKS endpoint for the issuer's public keys */
  RIPPLE_JWKS_URL?: string;
  /** test/offline seam: a literal JWK Set, used when RIPPLE_JWKS_URL is unset */
  RIPPLE_JWKS_JSON?: string;
  /** accepted `iss` values, comma-separated */
  RIPPLE_JWT_ISS?: string;
  /** the `aud` every token must carry */
  RIPPLE_JWT_AUD?: string;
  /** cap on `exp - iat` in seconds (default 900) */
  RIPPLE_JWT_MAX_TTL?: string;
  /** origins CORS is narrowed to once a policy is configured, comma-separated */
  RIPPLE_ALLOWED_ORIGINS?: string;
  /** Worker→DO shared secret; every internal fetch must carry it. Unset = no gate. */
  RIPPLE_INTERNAL_SECRET?: string;
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
