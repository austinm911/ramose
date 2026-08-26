/**
 * `RAMOSE_POLICY` → a `CompiledPolicy`, parsed once per isolate.
 *
 * Fail closed: a policy that is set but malformed leaves `policy` undefined
 * with `configured: true`, which every caller must read as "deny".
 */
import { type CompiledPolicy, type Principal } from "../core/index.ts";
import type { RamoseEnv } from "./env.ts";
export interface PolicyState {
    /** `RAMOSE_POLICY` is set — enforcement is armed even if parsing failed */
    readonly configured: boolean;
    readonly policy?: CompiledPolicy;
    /** why the policy is unusable (parse failure) */
    readonly error?: string;
}
/** Parse (and memoize) the compiled policy in `env`. */
export declare function policyOf(env: Pick<RamoseEnv, "RAMOSE_POLICY">): PolicyState;
/**
 * The policy the writer enforces. A configured-but-malformed policy denies
 * every non-admin write rather than falling open.
 */
export declare function enforcedPolicy(env: Pick<RamoseEnv, "RAMOSE_POLICY">): CompiledPolicy | undefined;
/** Test hook: forget every parsed policy. */
export declare function clearPolicyCache(): void;
/**
 * The Worker-verified `Principal` off the wire. Trusted metadata: the DO is
 * only reachable behind the internal secret, so this only re-shapes the JSON.
 */
export declare function asPrincipal(x: unknown): Principal | undefined;
//# sourceMappingURL=policy.d.ts.map