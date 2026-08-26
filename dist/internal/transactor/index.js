/**
 * The runtime-agnostic write path. Internal to the `ramose` package. The Durable Object shell
 * lives in ./transactor-do.ts (imports `cloudflare:workers`; import it from
 * Worker code only).
 */
export { Transactor, TransactorDeadError } from "./transactor.js";
export { DEFAULT_CONFIG } from "./host.js";
export { Indexer } from "./indexer.js";
export { envInt } from "./env.js";
export { INTERNAL_HEADER, internalGate, internalHeaders, isInternal } from "./internal.js";
export { asPrincipal, clearPolicyCache, enforcedPolicy, policyOf } from "./policy.js";
export { TxMetrics } from "./observability.js";
export { TxRejected, TransactorDead, BadRequest, NotFound, Internal, toHttpError, statusOf, errorResponse } from "./errors.js";
//# sourceMappingURL=index.js.map