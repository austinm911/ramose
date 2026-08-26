/**
 * Server-side operation execution: resolve, decode, run the full body
 * (effects included), accumulate one transaction.
 */
import { Db as CoreDb, Index, Novelty, PolicyMemo, allowsOperation, isSuperuser, normalizePullPattern, operationClassAllows, operationHasTargetArm, processTx, pull as enginePull, query as engineQuery, toJson, } from "../internal/core/index.js";
import { internalHeaders } from "../internal/transactor/index.js";
import * as Effect from "effect/Effect";
import { schemaTx } from "../db/ensure.js";
import { InternalError, InvalidRequest, isDatabaseError, NotOne, } from "../db/Errors.js";
import { buildOp, entityRefOf, runBody } from "../db/op-handle.js";
import { asLookupRef, decodeInput, finalizeOutput, } from "../db/Operation.js";
import { lowerPullPattern } from "../db/Pull.js";
import { tryLowerQueryObject } from "../db/query/index.js";
import { authState, checkWrite, viewDb, withEid } from "./auth.js";
import { BadRequest, OperationRejected, Unauthorized } from "./errors.js";
import { fetchBasisWithStats, invalidateBasis, segmentSource } from "./peer.js";
import { dbFromBasis } from "../internal/replica/basis.js";
export const lookupOperation = (registry, name) => registry?.get(name);
const tagOf = (err) => typeof err === "object" &&
    err !== null &&
    "_tag" in err &&
    typeof err._tag === "string"
    ? err._tag
    : undefined;
const asQueryFailure = (cause) => {
    if (isDatabaseError(cause))
        return cause;
    if (cause instanceof NotOne) {
        return new InvalidRequest({ message: cause.message });
    }
    return new InternalError({
        message: cause instanceof Error ? cause.message : String(cause),
    });
};
const overlayOn = (confirmed, extra) => {
    if (extra.length === 0)
        return confirmed;
    const nov = new Novelty();
    const avet = (a) => confirmed.schema.isAvet(a);
    const vaet = (a) => confirmed.schema.isVaet(a);
    nov.add(confirmed.novelty.byIndex[Index.EAVT].all(), avet, vaet);
    nov.add(extra, avet, vaet);
    let basisT = confirmed.basisT;
    for (const d of extra)
        if (d.t > basisT)
            basisT = d.t;
    return new CoreDb({
        store: confirmed.store,
        roots: confirmed.roots,
        novelty: nov,
        basisT,
        schema: confirmed.schema,
        nextEid: confirmed.nextEid,
    });
};
const withOps = async (base, ops) => {
    if (ops.length === 0)
        return base;
    const expansion = await processTx(base, [...ops], base.basisT + 1, base.nextEid, Date.now());
    return overlayOn(base, expansion.datoms);
};
const entityNamespaceOk = async (db, eid, ns) => {
    if (!(await db.exists(eid)))
        return "dangling";
    const row = await db.entity(eid);
    if (row === undefined)
        return "dangling";
    const keys = Object.keys(row).filter((k) => k !== ":db/id" && !k.startsWith(":db/"));
    if (keys.length === 0)
        return "dangling";
    const prefix = `:${ns}/`;
    return keys.some((k) => k.startsWith(prefix)) ? "ok" : "foreign";
};
const installOn = (env, db, schema, principal) => Effect.tryPromise({
    try: async () => {
        const stub = env.TRANSACTOR.get(env.TRANSACTOR.idFromName(db));
        const res = await stub.fetch(`https://transactor/transact?db=${encodeURIComponent(db)}`, {
            method: "POST",
            headers: { "content-type": "application/json", ...internalHeaders(env) },
            body: JSON.stringify({ tx: toJson(schemaTx(schema)), principal }),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(text || `install failed: ${res.status}`);
        }
        invalidateBasis(db);
        return res.json();
    },
    catch: (cause) => new InternalError({
        message: cause instanceof Error ? cause.message : String(cause),
    }),
});
/**
 * Resolve, decode, validate the entity, run the full body. Effects run
 * here; accumulated tx ops are returned for the existing write pipeline.
 */
const policyDenied = () => {
    throw new Unauthorized({ status: 403, code: "policy" });
};
export async function prepareOperation(args) {
    const operation = lookupOperation(args.registry, args.name);
    if (operation === undefined) {
        throw new BadRequest({ message: `unknown operation: ${args.name}` });
    }
    let decoded;
    try {
        decoded = await Effect.runPromise(decodeInput(operation.input, args.input));
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new BadRequest({ message: msg || "invalid operation input" });
    }
    const st = authState(args.env);
    if (st.configured && st.policy === undefined)
        throw new Unauthorized({});
    const policy = st.policy;
    const bypass = policy !== undefined && isSuperuser(args.principal, policy);
    // Class gate before touching the db. Unarmed ops deny everyone but superuser.
    // A named-rule / db-dependent arm on a registry-bare op cannot run
    // `allowsOperation` (no resolved target) — deny rather than ignore the rule.
    if (policy !== undefined && !bypass) {
        if (!operationClassAllows(policy, operation.name, args.principal)) {
            policyDenied();
        }
        if (operation.on === undefined && operationHasTargetArm(policy, operation.name)) {
            policyDenied();
        }
    }
    const bf = await fetchBasisWithStats(args.env, args.db, args.request);
    const store = segmentSource(args.env, args.db);
    // Filtered view. Existence / namespace checks below MUST stay on this
    // view — moving `entityNamespaceOk` onto the unfiltered rule db would
    // leak whether a read-hidden entity exists (409 vs 403).
    const dbv = await viewDb(args.env, args.principal, store, bf.basis, {});
    let self;
    if (operation.on !== undefined) {
        const raw = args.entity;
        const lookup = asLookupRef(raw);
        let eid;
        if (typeof raw === "number") {
            eid = raw;
        }
        else if (typeof raw === "object" &&
            raw !== null &&
            "id" in raw &&
            typeof raw.id === "number") {
            eid = raw.id;
        }
        else if (lookup !== undefined) {
            try {
                eid = await dbv.entid([lookup[0], lookup[1]]);
            }
            catch {
                eid = undefined;
            }
        }
        if (eid === undefined) {
            throw new OperationRejected({
                message: lookup !== undefined
                    ? `entity ${JSON.stringify(lookup)} does not exist`
                    : `operation ${operation.name} needs an entity`,
                operation: operation.name,
                reason: "dangling",
            });
        }
        // Filtered `dbv` only — see the viewDb comment above.
        const check = await entityNamespaceOk(dbv, eid, operation.on.ns);
        if (check !== "ok") {
            throw new OperationRejected({
                message: check === "dangling"
                    ? `entity ${eid} does not exist`
                    : `entity ${eid} is not a ${operation.on.ns}`,
                operation: operation.name,
                reason: check,
            });
        }
        self = eid;
        if (policy !== undefined && !bypass) {
            const ruleDb = await dbFromBasis(store, bf.basis);
            const who = await withEid(policy, args.principal, ruleDb);
            if (!(await allowsOperation(policy, operation.name, {
                db: ruleDb,
                principal: who,
                e: eid,
                memo: new PolicyMemo(),
            }))) {
                policyDenied();
            }
        }
    }
    let collected = () => [];
    const built = buildOp({
        schema: { _tag: "Schema", entities: {} },
        db: args.db,
        principal: {
            eid: args.principal.eid ?? null,
            class: args.principal.class,
            sub: args.principal.sub,
            name: typeof args.principal.claims.attrs?.name === "string"
                ? args.principal.claims.attrs.name
                : undefined,
            claims: { ...args.principal.claims },
        },
        self,
        effects: "run",
        effectCtx: {
            env: args.env,
            databases: {
                install: (catalog, name) => installOn(args.env, name ?? args.db, catalog, args.principal),
            },
        },
        q: (input) => Effect.tryPromise({
            try: async () => {
                const lowered = tryLowerQueryObject(input);
                const db = await withOps(dbv, collected());
                const result = await engineQuery(db, lowered.query, []);
                const rows = lowered.finalize(result);
                if (rows instanceof NotOne)
                    throw rows;
                return rows;
            },
            catch: asQueryFailure,
        }),
        pull: (subject, pattern) => Effect.tryPromise({
            try: async () => {
                const db = await withOps(dbv, collected());
                const normalized = normalizePullPattern(lowerPullPattern(pattern));
                const eid = typeof subject === "number"
                    ? subject
                    : await db.entid(entityRefOf(subject));
                if (eid === undefined)
                    return null;
                return enginePull(db, eid, normalized);
            },
            catch: asQueryFailure,
        }),
    });
    collected = built.ops;
    let result;
    try {
        result = await Effect.runPromise(runBody(operation, built.op, decoded));
    }
    catch (err) {
        const tag = tagOf(err);
        if (tag === "OperationRejected")
            throw err;
        throw new OperationRejected({
            message: err instanceof Error ? err.message : String(err),
            operation: operation.name,
            step: "body",
            reason: tag,
        });
    }
    const output = result.output;
    const encode = (tempids) => Effect.runPromise(finalizeOutput(operation.output, output, tempids));
    return {
        tx: [...built.ops()],
        output,
        principal: args.principal,
        clientOpId: args.clientOpId,
        encodeOutput: encode,
    };
}
export { checkWrite };
//# sourceMappingURL=operations.js.map