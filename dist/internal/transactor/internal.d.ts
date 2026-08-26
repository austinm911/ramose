/**
 * Worker→DO shared secret. The Transactor and QueryReplica objects are only
 * ever reached from the peer Worker; when `RAMOSE_INTERNAL_SECRET` is set every
 * internal fetch (including `/subscribe`) must carry it. Unset = no gate.
 */
import type { RamoseEnv } from "./env.ts";
export declare const INTERNAL_HEADER = "x-ramose-internal";
type SecretEnv = Pick<RamoseEnv, "RAMOSE_INTERNAL_SECRET">;
/** The header to put on a Worker→DO (or DO→DO) fetch; empty when no secret is configured. */
export declare function internalHeaders(env: SecretEnv): Record<string, string>;
/** Does this request carry the internal secret (always true when none is configured)? */
export declare function isInternal(env: SecretEnv, request: Request): boolean;
/** 401 when the gate is armed and the request did not present the secret. */
export declare function internalGate(env: SecretEnv, request: Request): Response | undefined;
export {};
//# sourceMappingURL=internal.d.ts.map