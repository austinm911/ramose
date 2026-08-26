/**
 * Session-client overlay: a confirmed log follower plus pending novelty
 * layers. HTTPS-only clients never construct one.
 *
 * The overlay view is the current-view store. Applying datoms (pending,
 * ack, inbound `{ op: tx }`, resync) is the notify — same step, after the
 * facts are visible to `view()`. Inbound confirmed datoms are already
 * assigned (`t`, eids) — `applyDatoms`, never `processTx`. Pending layers
 * stay off the confirmed log and are never sent to other sessions.
 */
import { Connection } from "../internal/core/conn.js";
import { Index, ValueTag } from "../internal/core/datom.js";
import { Db as EngineDb } from "../internal/core/db.js";
import { fromWireDatom } from "../internal/core/log.js";
import { Novelty } from "../internal/core/novelty.js";
import { QueryBudgetError, QueryError, query as engineQuery, } from "../internal/core/query/engine.js";
import { QueryParseError } from "../internal/core/query/parse.js";
import { normalizePullPattern, pull as enginePull, } from "../internal/core/query/pull.js";
import { processTx, TxError } from "../internal/core/tx.js";
import * as Effect from "effect/Effect";
import { schemaTx } from "./ensure.js";
import { tryLowerQueryObject } from "./query/index.js";
import { lowerPullPattern } from "./Pull.js";
import { NotOne } from "./Errors.js";
import { buildOp, entityRefOf, runBody } from "./op-handle.js";
import { asLookupRef, materializeOutput, } from "./Operation.js";
import { fromResponse, InternalError, InvalidRequest, isDatabaseError, NetworkError, QueryBudgetExceeded, TxRejected, } from "./Errors.js";
import { record, retryTransient } from "./http.js";
const TX_EID_CAP = 2 ** 42;
const asWireDatoms = (value) => Array.isArray(value) ? value : [];
const asTempids = (value) => {
    if (typeof value !== "object" || value === null)
        return {};
    const out = {};
    for (const [k, v] of Object.entries(value)) {
        if (typeof v === "number" && Number.isFinite(v))
            out[k] = v;
    }
    return out;
};
const remapEntityRef = (entity, eids, referred) => {
    if (typeof entity === "number")
        return eids.get(entity) ?? entity;
    if (typeof entity === "string" && referred[entity] !== undefined) {
        return referred[entity];
    }
    // Lookups (`[":user/name", "Ada"]`) are identity-based — pass through.
    return entity;
};
const clientTxId = () => typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `c${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const rewriteTempid = (value, ids) => typeof value === "string" && ids[value] !== undefined ? ids[value] : value;
const isLookupRef = (value) => Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "string" &&
    value[0].startsWith(":");
const forwardIdent = (ident) => {
    const slash = ident.lastIndexOf("/");
    return slash >= 0 && ident[slash + 1] === "_"
        ? ident.slice(0, slash + 1) + ident.slice(slash + 2)
        : ident;
};
const isRefAttr = (schema, a) => {
    if (schema === undefined)
        return false;
    if (typeof a === "number")
        return schema.attr(a)?.valueType === ValueTag.Ref;
    if (typeof a !== "string")
        return false;
    return schema.attr(forwardIdent(a))?.valueType === ValueTag.Ref;
};
/** Rewrite a tempid only in entity / ref positions — never a scalar like a title. */
const rewriteEntityForm = (value, ids, schema) => {
    if (isLookupRef(value))
        return value;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        return rewriteMap(value, ids, schema);
    }
    return rewriteTempid(value, ids);
};
const rewriteMap = (m, ids, schema) => {
    const out = {};
    for (const [k, v] of Object.entries(m)) {
        if (k === ":db/id") {
            out[k] = rewriteEntityForm(v, ids, schema);
        }
        else if (isRefAttr(schema, k)) {
            out[k] = Array.isArray(v) && !isLookupRef(v)
                ? v.map((x) => rewriteEntityForm(x, ids, schema))
                : rewriteEntityForm(v, ids, schema);
        }
        else {
            out[k] = v;
        }
    }
    return out;
};
/** @internal Pending-layer tempid rewrite. Tests pin `:db/update`. */
export const rewritePendingTx = (tx, ids, schema) => rewriteTx(tx, ids, schema);
const rewriteTx = (tx, ids, schema) => tx.map((item) => {
    if (Array.isArray(item)) {
        const [op, e, a, v] = item;
        if (op === ":db/retractEntity")
            return [op, rewriteEntityForm(e, ids, schema)];
        if (op === ":db/add" || op === ":db/retract" || op === ":db/update") {
            const next = [op, rewriteEntityForm(e, ids, schema)];
            if (item.length >= 3)
                next.push(a);
            if (item.length >= 4) {
                next.push(isRefAttr(schema, a) ? rewriteEntityForm(v, ids, schema) : v);
            }
            return next;
        }
        return item;
    }
    if (item !== null && typeof item === "object") {
        return rewriteMap(item, ids, schema);
    }
    return item;
});
const factKey = (d) => `${d.a}\0${JSON.stringify(d.v)}\0${d.op}`;
const rewriteEid = (e, eids) => eids.get(e) ?? e;
const rewriteDatoms = (datoms, eids) => {
    if (eids.size === 0)
        return datoms;
    return datoms.map((d) => {
        const e = rewriteEid(d.e, eids);
        const v = typeof d.v === "number" && eids.has(d.v) ? eids.get(d.v) : d.v;
        return e === d.e && v === d.v ? d : { ...d, e, v };
    });
};
const classifyQuery = (err) => {
    if (isDatabaseError(err))
        return err;
    if (err instanceof QueryBudgetError) {
        return new QueryBudgetExceeded({
            message: err.message,
            code: err.code,
            clause: err.clause,
            cells: err.cells,
            limit: err.limit,
            spentBy: err.spentBy,
        });
    }
    if (err instanceof QueryParseError ||
        err instanceof QueryError ||
        err instanceof NotOne) {
        return new InvalidRequest({ message: err.message });
    }
    return new InternalError({
        message: err instanceof Error ? err.message : String(err),
    });
};
const classifyTx = (err) => {
    if (isDatabaseError(err))
        return err;
    if (err instanceof TxError) {
        return new TxRejected({ message: err.message, code: err.code });
    }
    return new InternalError({
        message: err instanceof Error ? err.message : String(err),
    });
};
const unknownPullAttrs = (db, pattern) => {
    const out = [];
    const walk = (p) => {
        for (const spec of p) {
            if (spec.kind !== "attr" || spec.attr === undefined || spec.attr === ":db/id")
                continue;
            if (db.attr(spec.attr) === undefined)
                out.push(spec.attr);
            if (Array.isArray(spec.sub))
                walk(spec.sub);
        }
    };
    walk(pattern);
    return out;
};
const overlayDb = (confirmed, extra) => {
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
    return new EngineDb({
        store: confirmed.store,
        roots: confirmed.roots,
        novelty: nov,
        basisT,
        schema: confirmed.schema,
        nextEid: confirmed.nextEid,
    });
};
export const openOverlay = (options) => {
    const pending = [];
    let conn;
    let confirmedT = 0;
    /** `t` values whose facts are already in the follower. Used so a late
     * lower-`t` frame still applies after a higher `t` was painted, and so
     * empty/count-only stamps cannot skip a later real inbound at the same `t`. */
    const factTs = new Set();
    let epoch = 0;
    let readyGen = -1;
    let opening;
    let applied = Promise.resolve();
    let applyQueued = 0;
    let outbox = Promise.resolve();
    const listeners = new Set();
    /**
     * Orderer only. An idle, sync `fn` (a `{ op: tx }` with a ready
     * follower) runs before this returns — apply is the notify. A busy
     * queue (in-flight resync) defers `fn` onto the tail.
     */
    const enqueueApply = (fn) => {
        if (applyQueued === 0) {
            applyQueued = 1;
            try {
                const result = fn();
                if (result === undefined) {
                    applyQueued -= 1;
                    return Promise.resolve();
                }
                const done = Promise.resolve(result).finally(() => {
                    applyQueued -= 1;
                });
                applied = done.then(() => undefined, () => undefined);
                return done;
            }
            catch (err) {
                applyQueued -= 1;
                return Promise.reject(err);
            }
        }
        applyQueued += 1;
        const next = applied.then(fn, fn).finally(() => {
            applyQueued -= 1;
        });
        applied = next.then(() => undefined, () => undefined);
        return next;
    };
    /** Apply is the notify: epoch moves after the view already has the facts. */
    const notify = () => {
        epoch += 1;
        options.session.nudge();
        for (const cb of [...listeners])
            cb();
    };
    const pendingDatoms = () => {
        const out = [];
        for (const layer of pending)
            out.push(...layer.datoms);
        return out;
    };
    const view = () => {
        if (conn === undefined) {
            throw new Error("ramose: overlay view before the follower is ready");
        }
        return overlayDb(conn.db(), pendingDatoms());
    };
    const nextEid = () => {
        let n = conn?.nextEntityId ?? 1000;
        for (const layer of pending) {
            for (const d of layer.datoms) {
                if (d.e < TX_EID_CAP && d.e >= n)
                    n = d.e + 1;
            }
        }
        return n;
    };
    /** Paint server facts into the follower without claiming a log prefix. */
    const paintFacts = (datoms) => {
        if (conn === undefined || datoms.length === 0)
            return;
        const fresh = datoms.filter((d) => !factTs.has(d.t));
        if (fresh.length === 0)
            return;
        conn.applyDatoms(fresh);
        for (const d of fresh)
            factTs.add(d.t);
    };
    /**
     * `{ op: "tx" }` paints by the datom's `t`. It does **not** move the follow
     * cursor: own echo of N+1 must not claim the prefix (a still-queued N would
     * then be skipped by `sync({ from })`). `confirmedT` moves on a walked
     * sync reply or a snapshot dump.
     */
    const applyConfirmed = (datoms) => {
        if (conn === undefined)
            return;
        paintFacts(datoms);
    };
    const replaceConfirmed = async (datoms, t) => {
        const next = await Connection.fromDatoms(datoms);
        if (options.schema !== undefined) {
            await next.transact(schemaTx(options.schema));
        }
        conn = next;
        confirmedT = t;
        factTs.clear();
        for (const d of datoms)
            factTs.add(d.t);
        options.session.bump(t);
    };
    const remapQueued = (acked, local) => {
        const eids = new Map();
        for (const [tmp, serverEid] of Object.entries(acked)) {
            const was = local[tmp];
            if (typeof was === "number")
                eids.set(was, serverEid);
        }
        // only rewrite tempid *strings* a queued item referred to and did not mint
        const referred = {};
        for (const [tmp, serverEid] of Object.entries(acked)) {
            referred[tmp] = serverEid;
        }
        for (const layer of pending) {
            const foreign = {};
            for (const [tmp, serverEid] of Object.entries(referred)) {
                if (layer.tempids[tmp] === undefined)
                    foreign[tmp] = serverEid;
            }
            if (Object.keys(foreign).length > 0) {
                layer.tx = rewriteTx(layer.tx, foreign, conn?.db().schema);
            }
            if (layer.invocation?.entity !== undefined) {
                const next = remapEntityRef(layer.invocation.entity, eids, referred);
                if (next !== layer.invocation.entity) {
                    layer.invocation = { ...layer.invocation, entity: next };
                }
            }
            layer.datoms = rewriteDatoms(layer.datoms, eids);
            for (const [tmp, e] of Object.entries(layer.tempids)) {
                layer.tempids[tmp] = eids.get(e) ?? e;
            }
        }
    };
    const dropLayer = (clientTxId) => {
        const i = pending.findIndex((l) => l.clientTxId === clientTxId);
        if (i < 0)
            return undefined;
        return pending.splice(i, 1)[0];
    };
    const remapDropped = (layer, incoming) => {
        const serverE = new Map();
        for (const d of incoming) {
            if (d.e < TX_EID_CAP)
                serverE.set(factKey(d), d.e);
        }
        const eids = new Map();
        for (const d of layer.datoms) {
            if (d.e >= TX_EID_CAP)
                continue;
            const e = serverE.get(factKey(d));
            if (e !== undefined && d.e !== e)
                eids.set(d.e, e);
        }
        const acked = {};
        for (const [tmp, e] of Object.entries(layer.tempids)) {
            acked[tmp] = eids.get(e) ?? e;
        }
        remapQueued(acked, layer.tempids);
    };
    /**
     * Inbound `{ op: "tx" }` may land before the HTTP ack. Covering is by
     * `clientTxId` on the writer's own echo — a sieved subset still drops that
     * layer. Fact-set equality is not used: another session's overlapping
     * a/v/op must not drop this session's pending.
     */
    const dropCoveredPending = (incoming, coveredId) => {
        if (typeof coveredId !== "string" || coveredId.length === 0)
            return;
        const layer = dropLayer(coveredId);
        if (layer !== undefined)
            remapDropped(layer, incoming);
    };
    const ensureConn = async () => {
        if (conn !== undefined)
            return;
        conn = await Connection.create();
        if (options.schema !== undefined) {
            await conn.transact(schemaTx(options.schema));
        }
    };
    const requestSync = () => Effect.tryPromise({
        try: () => options.session.request({
            op: "sync",
            from: confirmedT,
        }),
        catch: (cause) => isDatabaseError(cause)
            ? cause
            : new NetworkError({
                message: cause instanceof Error ? cause.message : String(cause),
                cause,
            }),
    }).pipe(Effect.flatMap((got) => got.status >= 400
        ? Effect.fail(fromResponse(got.status, got.body, {
            get: (h) => got.headers?.[h.toLowerCase()] ?? null,
        }))
        : Effect.succeed(got)));
    const sync = async (retry = true) => {
        await ensureConn();
        const reply = await Effect.runPromise(retry
            ? retryTransient(requestSync, { while: () => !options.session.closed })
            : requestSync());
        readyGen = options.session.generation;
        // Frames from this walk are queued on `applied`. Stamp the follow cursor
        // only after they run, and only to the worker's walked `t` — not a log
        // tip the worker jumped to. A resync dump already stamped via replaceConfirmed.
        await applied;
        const t = record(reply.body).t;
        if (typeof t === "number" && t > confirmedT) {
            confirmedT = t;
            options.session.bump(t);
        }
    };
    const ready = (retry = true) => Effect.tryPromise({
        try: async () => {
            if (readyGen !== options.session.generation || conn === undefined) {
                if (opening !== undefined)
                    await opening;
                else {
                    const started = sync(retry).finally(() => {
                        if (opening === started)
                            opening = undefined;
                    });
                    opening = started;
                    await started;
                }
            }
            await applied;
        },
        catch: (cause) => isDatabaseError(cause)
            ? cause
            : new NetworkError({
                message: cause instanceof Error ? cause.message : String(cause),
                cause,
            }),
    });
    const read = (op, body) => ready().pipe(Effect.flatMap(() => Effect.tryPromise({
        try: async () => {
            // Join the apply queue (resync / ack). Inbound `{ op: tx }`
            // applies in the message turn when the queue is idle.
            await applied;
            const db = view();
            // Same turn as view() — a waiter that can observe a newer epoch
            // than this view must not exist. Live parks on `epoch`, not on a
            // session snapshot taken before the pass.
            const viewed = epoch;
            if (op === "pull") {
                const pattern = normalizePullPattern(body.pattern);
                const unknown = unknownPullAttrs(db, pattern);
                if (unknown.length > 0) {
                    throw new InvalidRequest({
                        message: `unknown attribute${unknown.length > 1 ? "s" : ""} in pull pattern: ${unknown.join(", ")}`,
                    });
                }
                const subject = body.eid;
                const eid = typeof subject === "number"
                    ? subject
                    : await db.entid(subject);
                if (eid === undefined) {
                    return { t: confirmedT, result: null, epoch: viewed };
                }
                return {
                    t: confirmedT,
                    result: await enginePull(db, eid, pattern),
                    epoch: viewed,
                };
            }
            const result = await engineQuery(db, body.query, Array.isArray(body.inputs) ? body.inputs : []);
            return { t: confirmedT, root: confirmedT, result, epoch: viewed };
        },
        catch: classifyQuery,
    })));
    const transact = (tx) => ready(false).pipe(Effect.flatMap(() => Effect.gen(function* () {
        const expansion = yield* Effect.tryPromise({
            try: () => processTx(view(), tx, 
            // Fake local `t` only — not a dense log assignment. Must sit
            // above painted server facts (`factTs`) as well as `confirmedT`,
            // or a later pending layer collides with an ack we did not
            // stamp as prefix.
            Math.max(confirmedT, ...factTs, 0) + pending.length + 1, nextEid(), Date.now()),
            catch: classifyTx,
        });
        const id = clientTxId();
        pending.push({
            clientTxId: id,
            tx: tx,
            datoms: expansion.datoms,
            tempids: expansion.tempids,
        });
        notify();
        const posted = yield* Effect.callback((resume) => {
            const run = () => Effect.runPromise(options.post(pending.find((l) => l.clientTxId === id)?.tx ?? tx, id))
                .then(async (body) => {
                const ack = record(body);
                const t = typeof ack.t === "number" ? ack.t : 0;
                const raw = ack.datoms;
                const datoms = Array.isArray(raw) ? raw : [];
                const tempids = asTempids(ack.tempids);
                // Drop + remap on the apply queue so covering stays ordered.
                // Do not stamp `confirmedT` — a later writer’s ack.t is not
                // a prefix. Own `{ op: "tx" }` paints and drops pending; it
                // does not claim the follow cursor either.
                // Paint a real WireDatom[] so dbAfter / live keep the write
                // (never local processTx; a number is datomCount only).
                await enqueueApply(() => {
                    const layer = dropLayer(id);
                    if (Array.isArray(raw))
                        paintFacts(datoms.map(fromWireDatom));
                    if (layer !== undefined)
                        remapQueued(tempids, layer.tempids);
                    notify();
                });
                resume(Effect.succeed({
                    t,
                    txEid: typeof ack.txEid === "number" ? ack.txEid : 0,
                    tempids,
                    datoms,
                    datomCount: datoms.length > 0
                        ? datoms.length
                        : typeof ack.datoms === "number"
                            ? ack.datoms
                            : 0,
                    clientTxId: typeof ack.clientTxId === "string" ? ack.clientTxId : id,
                }));
            })
                .catch(async (err) => {
                await enqueueApply(() => {
                    dropLayer(id);
                    notify();
                });
                resume(Effect.fail(isDatabaseError(err) ? err : classifyTx(err)));
            });
            const next = outbox.then(run, run);
            outbox = next.catch(() => undefined);
            return Effect.void;
        });
        return posted;
    })));
    const speculative = async (extra) => {
        const base = view();
        if (extra.length === 0)
            return base;
        const expansion = await processTx(base, [...extra], Math.max(confirmedT, ...factTs, 0) + pending.length + 1, nextEid(), Date.now());
        return overlayDb(base, expansion.datoms);
    };
    const run = (args) => ready(false).pipe(Effect.flatMap(() => Effect.gen(function* () {
        let collected = () => [];
        const self = yield* Effect.promise(async () => {
            const lookup = asLookupRef(args.invocation.entity);
            if (lookup === undefined)
                return args.invocation.entity;
            try {
                return (await view().entid([lookup[0], lookup[1]])) ?? args.invocation.entity;
            }
            catch {
                return args.invocation.entity;
            }
        });
        const built = buildOp({
            schema: args.schema,
            db: args.db,
            principal: {
                eid: args.principal.eid,
                class: args.principal.class,
                claims: {},
            },
            self,
            effects: "halt",
            q: (input) => Effect.tryPromise({
                try: async () => {
                    const lowered = tryLowerQueryObject(input);
                    const db = await speculative(collected());
                    const result = await engineQuery(db, lowered.query, []);
                    const rows = lowered.finalize(result);
                    if (rows instanceof NotOne)
                        throw rows;
                    return rows;
                },
                catch: classifyQuery,
            }),
            pull: (subject, pattern) => Effect.tryPromise({
                try: async () => {
                    const db = await speculative(collected());
                    const normalized = normalizePullPattern(lowerPullPattern(pattern));
                    const eid = typeof subject === "number"
                        ? subject
                        : await db.entid(entityRefOf(subject));
                    if (eid === undefined)
                        return null;
                    return enginePull(db, eid, normalized);
                },
                catch: classifyQuery,
            }),
        });
        collected = built.ops;
        yield* runBody(args.operation, built.op, args.invocation.input).pipe(Effect.mapError((e) => isDatabaseError(e) ? e : classifyTx(e)));
        const tx = [...built.ops()];
        const id = args.invocation.clientOpId;
        let invocation = { ...args.invocation };
        if (tx.length > 0) {
            const expansion = yield* Effect.tryPromise({
                try: () => processTx(view(), tx, Math.max(confirmedT, ...factTs, 0) + pending.length + 1, nextEid(), Date.now()),
                catch: classifyTx,
            });
            pending.push({
                clientTxId: id,
                tx,
                datoms: expansion.datoms,
                tempids: expansion.tempids,
                invocation,
            });
            notify();
        }
        const posted = yield* Effect.callback((resume) => {
            const postOp = options.postOp;
            if (postOp === undefined) {
                resume(Effect.fail(new InternalError({
                    message: "ramose: overlay has no postOp",
                })));
                return Effect.void;
            }
            const runPost = () => Effect.runPromise(postOp(pending.find((l) => l.clientTxId === id)?.invocation ??
                invocation))
                .then(async (body) => {
                const ack = record(body);
                const t = typeof ack.t === "number" ? ack.t : 0;
                const raw = ack.datoms;
                const datoms = Array.isArray(raw) ? raw : [];
                const tempids = asTempids(ack.tempids);
                await enqueueApply(() => {
                    const layer = dropLayer(id);
                    if (Array.isArray(raw))
                        paintFacts(datoms.map(fromWireDatom));
                    if (layer !== undefined)
                        remapQueued(tempids, layer.tempids);
                    notify();
                });
                resume(Effect.succeed({
                    t,
                    txEid: typeof ack.txEid === "number" ? ack.txEid : 0,
                    tempids,
                    datoms,
                    datomCount: datoms.length > 0
                        ? datoms.length
                        : typeof ack.datoms === "number"
                            ? ack.datoms
                            : 0,
                    clientTxId: id,
                    clientOpId: id,
                    output: materializeOutput(ack.output, tempids),
                }));
            })
                .catch(async (err) => {
                await enqueueApply(() => {
                    dropLayer(id);
                    notify();
                });
                resume(Effect.fail(isDatabaseError(err) ? err : classifyTx(err)));
            });
            const next = outbox.then(runPost, runPost);
            outbox = next.catch(() => undefined);
            return Effect.void;
        });
        return posted;
    })));
    /** The one tx apply: paint, then notify. */
    const applyTx = (frame) => {
        const incoming = asWireDatoms(frame.datoms).map(fromWireDatom);
        applyConfirmed(incoming);
        dropCoveredPending(incoming, typeof frame.clientTxId === "string" ? frame.clientTxId : undefined);
        notify();
    };
    const applyFrame = (frame) => {
        if (conn === undefined) {
            return ensureConn().then(() => applyFrame(frame));
        }
        if (frame.op === "resync") {
            pending.length = 0;
            const t = typeof frame.t === "number" ? frame.t : 0;
            return replaceConfirmed(asWireDatoms(frame.datoms).map(fromWireDatom), t).then(() => {
                notify();
            });
        }
        if (frame.op === "tx")
            applyTx(frame);
    };
    const handlePush = (frame) => enqueueApply(() => applyFrame(frame));
    options.session.onPush(handlePush);
    return {
        get confirmedT() {
            return confirmedT;
        },
        get epoch() {
            return epoch;
        },
        onChange: (cb) => {
            listeners.add(cb);
            return () => {
                listeners.delete(cb);
            };
        },
        ready,
        read,
        transact,
        run,
        handlePush,
    };
};
//# sourceMappingURL=overlay.js.map