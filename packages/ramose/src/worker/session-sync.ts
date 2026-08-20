/**
 * Session log walk: what one principal may hear about one committed tx.
 *
 * The replica stays unfiltered. This is the sieve the Worker session applies
 * before a `{ op: "tx" }` / `{ op: "resync" }` leaves toward the browser.
 * A fully-filtered data tx is silence (no `t` leak). A grant or revoke that
 * flips this principal's rule view is `resync`, not a one-datom apply.
 */

import {
  type CompiledPolicy,
  type Datom,
  type Db,
  type PolicyExpr,
  type PolicyRules,
  type Principal,
  type WireDatom,
  Index,
  POLICY_OPS,
  PolicyMemo,
  allowsOp,
  filterDb,
  isAdmin,
  isSystemAttrId,
  toWireDatom,
} from "../internal/core/index.ts";
import { FilteredDb } from "../internal/core/policy/filter.ts";

export type SessionTxKind = "skip" | "tx" | "resync";

export interface SessionTxDecision {
  readonly kind: SessionTxKind;
  /** present when `kind === "tx"` — already sieved */
  readonly datoms?: WireDatom[];
}

export interface SessionLogEntry {
  readonly t: number;
  readonly datoms: WireDatom[];
}

export interface SessionLog {
  readonly t: number;
  readonly rootT: number;
  readonly entries: readonly SessionLogEntry[];
}

/** Every ident a rule reads via `eq` or `ref` — the grant attributes. */
export function grantIdents(policy: CompiledPolicy): Set<string> {
  const out = new Set<string>();
  const walkExpr = (expr: PolicyExpr): void => {
    switch (expr._tag) {
      case "eq":
        out.add(expr.attr);
        break;
      case "ref":
        out.add(expr.attr);
        walkExpr(expr.target);
        break;
      case "and":
      case "or":
        for (const e of expr.exprs) walkExpr(e);
        break;
      case "not":
        walkExpr(expr.expr);
        break;
    }
  };
  const walkRules = (rules: PolicyRules | undefined): void => {
    if (!rules) return;
    for (const op of POLICY_OPS) for (const arm of rules[op] ?? []) walkExpr(arm.expr);
  };
  for (const rules of Object.values(policy.attrs)) walkRules(rules);
  if (policy.ns) for (const rules of Object.values(policy.ns)) walkRules(rules);
  return out;
}

async function isVisible(d: Datom, ruleDb: Db, policy: CompiledPolicy, principal: Principal, memo: PolicyMemo): Promise<boolean> {
  if (isSystemAttrId(d.a)) return true;
  const attr = ruleDb.attr(d.a) ?? ruleDb.schema.attr(d.a);
  if (!attr) return false;
  return allowsOp(policy, "read", attr.ident, { db: ruleDb, principal, e: d.e, memo });
}

/**
 * Did this tx change what `principal` can read? Fast path: a grant-attr
 * datom that names them. Slow path: `allowsOp("read")` flips on any fact.
 */
export async function ruleViewChanged(opts: {
  datoms: readonly Datom[];
  policy: CompiledPolicy;
  principal: Principal;
  ruleDbAfter: Db;
  ruleDbBefore: Db;
}): Promise<boolean> {
  const { datoms, policy, principal, ruleDbAfter, ruleDbBefore } = opts;
  const grants = grantIdents(policy);
  const grantIds = new Set<number>();
  for (const ident of grants) {
    const attr = ruleDbAfter.attr(ident) ?? ruleDbBefore.attr(ident);
    if (attr) grantIds.add(attr.id);
  }
  const peid = principal.eid;
  const memoBefore = new PolicyMemo();
  const memoAfter = new PolicyMemo();
  for (const d of datoms) {
    if (peid !== undefined && grantIds.has(d.a) && (d.e === peid || d.v === peid)) return true;
    if (isSystemAttrId(d.a)) continue;
    const attr = ruleDbAfter.attr(d.a) ?? ruleDbBefore.attr(d.a);
    if (!attr) continue;
    const before = await allowsOp(policy, "read", attr.ident, { db: ruleDbBefore, principal, e: d.e, memo: memoBefore });
    const after = await allowsOp(policy, "read", attr.ident, { db: ruleDbAfter, principal, e: d.e, memo: memoAfter });
    if (before !== after) return true;
  }
  return false;
}

/**
 * One committed entry, judged after that commit.
 *
 * - no policy / admin → every datom, as a `tx`
 * - rule-view change → `resync` (grant of membership, revoke-of-P, …)
 * - nothing visible → `skip` (the socket must not learn that `t` happened)
 * - else → `tx` with the kept facts
 */
export async function decideSessionTx(opts: {
  datoms: readonly Datom[];
  policy?: CompiledPolicy;
  principal?: Principal;
  ruleDbAfter: Db;
  ruleDbBefore: Db;
}): Promise<SessionTxDecision> {
  const { datoms, policy, principal, ruleDbAfter, ruleDbBefore } = opts;
  if (!policy || !principal || isAdmin(principal)) {
    return { kind: "tx", datoms: datoms.map(toWireDatom) };
  }
  if (await ruleViewChanged({ datoms, policy, principal, ruleDbAfter, ruleDbBefore })) {
    return { kind: "resync" };
  }
  const view = filterDb(ruleDbAfter, ruleDbAfter, policy, principal);
  const kept: WireDatom[] = [];
  let userKept = 0;
  const keep = async (d: Datom, visible: boolean): Promise<void> => {
    if (!visible) return;
    kept.push(toWireDatom(d));
    if (!isSystemAttrId(d.a)) userKept++;
  };
  if (view instanceof FilteredDb) {
    for (const d of datoms) await keep(d, await view.visible(d));
  } else {
    const memo = new PolicyMemo();
    for (const d of datoms) await keep(d, await isVisible(d, ruleDbAfter, policy, principal, memo));
  }
  // `:db/txInstant` and other bootstrap facts are always visible; they must
  // not keep a fully-filtered data tx on the socket (that would leak `t`).
  if (userKept === 0) return { kind: "skip" };
  return { kind: "tx", datoms: kept };
}

/** Current-value facts a principal may read — first sync / resync dump, no history. */
export async function currentViewDatoms(db: Db): Promise<WireDatom[]> {
  const out: WireDatom[] = [];
  for await (const chunk of db.datoms(Index.EAVT, {})) {
    for (const d of chunk) out.push(toWireDatom(d));
  }
  return out;
}
