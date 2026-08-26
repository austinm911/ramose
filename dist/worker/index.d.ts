/**
 * Ramose peer Worker — the HTTP API and the edge datalog executor.
 *
 * Read-path knobs (per request by header, default by env — see peer.ts):
 * `x-ramose-replica-hint: wnam|enam|…|auto|continent` picks the replica DO placement
 * (hint is part of the DO id; default `auto` = colo→hint); `x-ramose-cache-basis: 0|1`
 * (default 1) reuses an isolate-cached basis instead of calling the replica each read;
 * `x-ramose-cache-mode: ttl|peer` (default ttl = 5 s) picks the cache's consistency story;
 * `x-ramose-min-t: <t>` makes a read refetch if the cached basis is older than t.
 *
 *   GET  /                                  demo app (CRUD + as-of history view)
 *   GET  /health              { ok, service, stage, time, operations: string[] }
 *   POST /db/:name/transact   { tx, clientTxId? }        → { t, txEid, tempids, datoms: WireDatom[], clientTxId? }
 *   POST /db/:name/op         { name, entity?, input, clientOpId } → { t, txEid, tempids, datoms, clientOpId, output }
 *   POST /db/:name/query      { query, inputs?, asOf?, history? }   → { t, result }
 *   POST /db/:name/pull       { eid, pattern, asOf?, history? }     → { t, result }
 *   GET  /db/:name/entity/:eid[?asOf=]                              → { t, entity }
 *   GET  /db/:name/info                                            → { db, t, principal, … } — `t` and `principal` for everyone; transactor/replica internals for admin
 *   GET  /db/:name/session    (Upgrade: websocket)                 → auth + upgrade onto the replica stub (follow lives on the replica)
 *   POST /db/:name/admin/index | /admin/gc                         → indexer controls
 *
 * Reads: basis (root + novelty) from the nearest QueryReplica DO → Db over
 * cached segments → datalog here in the Worker. Writes: forwarded to the
 * Transactor DO. Auth: a bearer token resolved to a `Principal` per request
 * (auth.ts) — a verified JWT under `RAMOSE_POLICY`, else the legacy shared
 * `RAMOSE_TOKEN`; the policy filters reads and checks writes.
 *
 * The request is one Effect: routing failures are `Data.TaggedError`s
 * (errors.ts) mapped back to responses with `Effect.catchTags`, and every
 * request emits one Analytics Engine point through the `Analytics` service
 * (analytics.ts) — a no-op when the `ANALYTICS` binding is absent.
 */
import type { RamoseEnv } from "../RamoseEnv.ts";
import { TransactorDO } from "../internal/transactor/transactor-do.ts";
import { QueryReplicaDO } from "../internal/replica/index.ts";
import { type ServerOptions } from "./operations.ts";
export type { ServerOptions } from "./operations.ts";
export { resolveWrites } from "../writes.ts";
export { TransactorDO, QueryReplicaDO };
export type { RamoseEnv } from "../RamoseEnv.ts";
export { type ErrorHttp, errorResponse, errorToHttp, statusOf, toDbError } from "../errorHttp.ts";
export { toHttp, fromThrown, isRamoseError } from "./errors.ts";
/** Test hook: forget the policy + writes: "all" / unrecognized-env warnings. */
export declare const clearWritesWarning: () => void;
/**
 * Build a peer Worker over a bundled operations registry.
 * Raw `/transact` is closed for app-class tokens by default (`writes:
 * "operations"` / unset `RAMOSE_WRITES`). `"all"` is the explicit opt-out.
 * Admin and the seed token (`$token`) keep `/transact`.
 */
export declare const createServer: (options?: ServerOptions) => {
    fetch(request: Request, env: RamoseEnv, _ctx?: ExecutionContext): Promise<Response>;
};
declare const _default: {
    fetch(request: Request, env: RamoseEnv, _ctx?: ExecutionContext): Promise<Response>;
};
export default _default;
//# sourceMappingURL=index.d.ts.map