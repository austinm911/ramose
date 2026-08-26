/**
 * Peer-owned principal provisioning: upsert the row the policy's `principal`
 * attr names, materialize the token class as a sibling `:ns/role` fact when
 * that attribute exists, and stamp each `ramose.attrs` key onto `:ns/${key}`
 * when the sibling attr is deployed and the JS type matches.
 *
 * Clients never write this row. Anonymous and service principals have no
 * `sub` and stay unresolved — deny-by-default still applies.
 */
import type { Db } from "../db.ts";
import type { CompiledPolicy } from "./ast.ts";
import type { Principal } from "./principal.ts";
/** The fact name the peer writes next to the principal attr (`:user/sub` → `:user/role`). */
export declare const ROLE_NAME = "role";
/** A signed-in user with a `sub` — the only kind the peer will write a row for. */
export declare function shouldProvision(principal: Principal): boolean;
/** `:user/sub` + `"name"` → `:user/name`. */
export declare function siblingIdentOf(principalAttr: string, name: string): string;
/** `:user/sub` + `"role"` → `:user/role`. */
export declare function roleIdentOf(principalAttr: string): string;
/**
 * The map of idents the peer wants on this principal row, or `undefined`
 * when there is nothing to own (no row owed, or the principal attr is not
 * deployed as unique-identity).
 */
export declare function wantedFacts(policy: CompiledPolicy, principal: Principal, db: Db): Record<string, unknown> | undefined;
/**
 * The map-form upsert to run, or `undefined` when there is nothing to write:
 * no row is owed, the principal attr is not deployed, or the row already
 * carries every wanted fact (`sub`, role, and matching attrs).
 */
export declare function provisionTx(policy: CompiledPolicy, principal: Principal, db: Db): Promise<unknown[] | undefined>;
/** Resolve `sub` through the policy's principal attr. */
export declare function resolveProvisionedEid(policy: CompiledPolicy, principal: Principal, db: Db): Promise<number | undefined>;
//# sourceMappingURL=provision.d.ts.map