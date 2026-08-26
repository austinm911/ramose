/**
 * `Db<C>` — one database, typed from its catalog.
 *
 * A db is a **value**: `ramose.db(name, catalog)` is pure, `asOf(t)` and
 * `history` are `Db -> ReadDb` with zero I/O, and `dbAfter` on a
 * {@link TxReport} is the same db (a min-`t` floor on HTTPS; the local
 * confirmed overlay on a session client). Nothing here names a transport:
 * a session client reads the overlay and writes through `POST /op`
 * (`db.run`); raw `POST /transact` is admin / seed / `writes: "all"`.
 * HTTPS-only clients POST reads and writes, and neither path is
 * reachable from the public surface.
 */
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import { DATABASE_NAME_RE, invalidDatabaseName } from "./DatabaseName.js";
import { makeEid } from "./Eid.js";
import { lowerEntityArg } from "./entityArg.js";
import { schemaTx } from "./ensure.js";
import { assembleInstalled, checkEvolution, installTx, occupancyIdents, occupancyQuery, installedCoreQuery, installedOptionalQuery, installedUniqueQuery, namespacesNeedingOccupancy, } from "./evolution.js";
import { InvalidRequest, NotOne, } from "./Errors.js";
export { IncompatibleSchema } from "./Errors.js";
import { asPromise, fromStream } from "./promise.js";
import { shareEqualDeep } from "./shareEqualDeep.js";
import { runOperation } from "./run.js";
import { compact, record } from "./http.js";
import { tryLowerQueryObject, } from "./query/index.js";
import { lowerPullPattern, reshapePullResult, } from "./Pull.js";
/** @internal The registry key {@link DbSeam} is attached under. */
export const DB_SEAM = Symbol.for("ramose.db.seam");
/**
 * @internal Raw `POST /transact` submit — admin / seed / test. Not on the
 * public `Db` or `EffectDb` shapes. App writes use {@link Db.run}.
 */
export const DB_SUBMIT = Symbol.for("ramose.db.submit");
/** One token per client, so views over different clients never compare equal. */
const clientTokens = new WeakMap();
let nextClientToken = 1;
const attachSeam = (db, wire, name, view, liveRaw) => {
    let client = clientTokens.get(wire);
    if (client === undefined) {
        client = nextClientToken++;
        clientTokens.set(wire, client);
    }
    const seam = {
        key: `${client}/${name}` +
            `?asOf=${view.asOf ?? ""}&history=${view.history === true}` +
            `&minT=${view.minT ?? ""}`,
        asOf: view.asOf,
        onWake: (cb) => wire.session(name)?.onWake(cb),
        t: () => wire.session(name)?.t,
        generation: () => wire.session(name)?.generation ?? 0,
        status: () => wire.session(name)?.status ?? "offline",
        liveRaw,
    };
    db[DB_SEAM] = seam;
};
/** The pause between `live` passes that failed non-terminally, in ms. */
const RETRY_MIN = 250;
const RETRY_MAX = 5000;
/**
 * Failures a standing query must not retry: re-running them changes nothing.
 * `Unauthorized` reaches here only after the session already re-read the token
 * and re-authenticated in place, so a second one is terminal.
 */
const terminal = (e) => e._tag === "InvalidRequest" ||
    e._tag === "DatabaseNotFound" ||
    e._tag === "Unauthorized" ||
    e._tag === "QueryBudgetExceeded" ||
    e._tag === "NotOne" ||
    e._tag === "OperationRejected";
/** `[User.name, "Ada"]` and `[":user/name", "Ada"]` both lower to the wire form. */
const lowerSubject = (subject) => lowerEntityArg(subject);
/** @internal Everything a `Db` and its `ReadDb` views share. */
const makeRead = (wire, name, schema, view, bad) => {
    const fenced = (effect) => bad === undefined ? effect : Effect.fail(bad);
    const pullOne = (subject, pattern, minT) => wire
        .read(name, "pull", compact({
        eid: lowerSubject(subject),
        pattern: lowerPullPattern(pattern),
        asOf: view.asOf,
        history: view.history === true ? true : undefined,
    }), minT ?? view.minT)
        .pipe(Effect.map((body) => {
        const rec = record(body);
        return {
            value: reshapePullResult(pattern, rec.result),
            t: typeof rec.t === "number" ? rec.t : 0,
            viewed: typeof rec.epoch === "number" ? rec.epoch : undefined,
        };
    }));
    const runQuery = (input, minT, raw = false) => Effect.gen(function* () {
        let lowered;
        try {
            lowered = tryLowerQueryObject(input);
        }
        catch (e) {
            return yield* Effect.fail(e instanceof InvalidRequest
                ? e
                : new InvalidRequest({
                    message: e instanceof Error ? e.message : String(e),
                }));
        }
        const reply = record(yield* wire.read(name, "q", compact({
            query: lowered.query,
            inputs: [],
            asOf: view.asOf,
            history: view.history === true ? true : undefined,
        }), minT ?? view.minT));
        const t = typeof reply.t === "number" ? reply.t : 0;
        const viewed = typeof reply.epoch === "number" ? reply.epoch : undefined;
        // Shared `useLive` cache holds this raw wire result; each subscriber
        // applies its own `finalize` (take-unwrap / page-wrap / reshape).
        if (raw)
            return { rows: reply.result, t, viewed };
        // `finalize` applies the query's terminal too: a page wraps, a take
        // unwraps — an `oneOrFail()` miss comes back as the NotOne to fail with
        const rows = lowered.finalize(reply.result);
        if (rows instanceof NotOne)
            return yield* Effect.fail(rows);
        return { rows, t, viewed };
    });
    /**
     * Keep a standing query alive: re-run a pass that failed non-terminally
     * until it succeeds. This is not a transient policy — the wire's
     * `retryTransient` ladder already retried each Unavailable / NetworkError
     * attempt and only surfaces once spent — it is what happens *after* that
     * (an outage longer than the ladder), and for the failures the ladder does
     * not touch (a 5xx `InternalError`). Exponential pause, capped.
     */
    const withBackoff = (attempt) => {
        const step = (wait) => attempt.pipe(Effect.catch((e) => {
            if (terminal(e))
                return Effect.fail(e);
            const next = wait === 0 ? RETRY_MIN : Math.min(wait * 2, RETRY_MAX);
            return Effect.sleep(next).pipe(Effect.andThen(() => step(next)));
        }));
        return step(0);
    };
    /**
     * The standing loop `live` and `livePull` share: run a pass, emit when the
     * shared value is not `Object.is` the previous emission, sleep until the
     * overlay mutates (or the session's basis on HTTPS). Unchanged rows keep
     * their previous object identity (`shareEqualDeep`). What varies is only
     * the pass itself — a query for `live`, a pull for `livePull`.
     */
    const standing = (runPass) => Stream.callback((queue) => Effect.gen(function* () {
        if (bad !== undefined)
            return yield* Queue.fail(queue, bad);
        const session = wire.session(name);
        const pinned = view.asOf !== undefined || view.history === true;
        // pinned reads stay on the peer — do not construct an overlay just
        // to decide the waiter. Overlay live is a function of that db.
        const overlay = !pinned ? wire.overlay?.(name) : undefined;
        const overlaid = overlay !== undefined;
        if (!pinned && session === undefined) {
            return yield* Queue.failCause(queue, Cause.die(new Error("ramose: db.live needs the session socket — pass `webSocket` to Ramose.connect or Ramose.layer (or run where a global WebSocket exists)")));
        }
        const none = Symbol("none");
        let last = none;
        for (;;) {
            const seen = session?.t ?? 0;
            const generation = session?.generation ?? 0;
            const httpsEpoch = session?.epoch ?? 0;
            // one pass; the wire ladder retries its transient attempts, and
            // withBackoff only re-runs the pass once that ladder is spent.
            // Overlay does not fence on session.t — live re-runs when that db
            // mutates. The viewed epoch is captured at view(), not here.
            const pass = yield* withBackoff(runPass(overlaid ? undefined : seen || undefined));
            // reuse previous row objects when deep-equal; skip the tick when
            // the shared root is the previous emission
            const shared = last === none ? pass.value : shareEqualDeep(last, pass.value);
            if (last === none || shared !== last) {
                last = shared;
                yield* Queue.offer(queue, shared);
            }
            if (pinned || session === undefined)
                break;
            if (overlaid && overlay !== undefined) {
                yield* awaitOverlay(overlay, session, generation, pass.viewed ?? overlay.epoch);
            }
            else {
                yield* awaitWake(session, generation, httpsEpoch, {
                    minT: Math.max(seen, pass.t),
                });
            }
        }
        return yield* Queue.end(queue);
    }).pipe(Effect.catch((e) => Queue.fail(queue, e))));
    const liveStanding = (input, raw) => standing((minT) => runQuery(input, minT, raw).pipe(Effect.map((pass) => ({
        value: pass.rows,
        t: pass.t,
        viewed: pass.viewed,
    }))));
    const read = {
        name,
        schema,
        query: ((input) => fenced(Effect.suspend(() => runQuery(input, undefined).pipe(Effect.map((r) => r.rows))))),
        live: ((input) => liveStanding(input, false)),
        pull: ((subject, pattern) => fenced(Effect.suspend(() => pullOne(subject, pattern, undefined).pipe(Effect.map((pass) => pass.value))))),
        livePull: ((subject, pattern) => standing((minT) => pullOne(subject, pattern, minT))),
        // a pinned view answers from its own coordinate; a live view (history
        // included) asks the peer, not `session.t` — that is 0 before the first
        // frame and lags a fresh peer, while `/info` is authoritative and cheap
        basis: () => fenced(view.asOf !== undefined
            ? Effect.succeed({ t: view.asOf })
            : Effect.suspend(() => wire.info(name).pipe(Effect.map((body) => {
                const raw = record(body).t;
                const t = typeof raw === "number" ? raw : 0;
                // an observed basis advances the whole connection: a
                // standing `live` that missed a tick re-runs (as `transact`)
                wire.session(name)?.bump(t);
                return { t };
            })))),
        asOf: (t) => makeRead(wire, name, schema, { ...view, asOf: t }, bad),
        get history() {
            return makeRead(wire, name, schema, { ...view, history: true }, bad);
        },
    };
    // enumerable, so `makeDb`'s spread carries it onto the writable db too
    attachSeam(read, wire, name, view, (query) => fromStream(liveStanding(query, true)));
    return read;
};
/**
 * Overlay live: wait until that db mutates past the epoch this pass
 * viewed, or the socket drops. The viewed epoch is captured at `view()`,
 * so apply-then-notify cannot park a waiter on a newer epoch than the
 * rows it just read.
 */
const awaitOverlay = (overlay, session, generation, viewed) => Effect.callback((resume) => {
    let done = false;
    const settle = () => {
        if (done)
            return;
        done = true;
        offChange();
        offWake();
        resume(Effect.void);
    };
    const news = () => overlay.epoch !== viewed || session.generation !== generation;
    const offChange = overlay.onChange(() => {
        if (news())
            settle();
    });
    const offWake = session.onWake(() => {
        if (news())
            settle();
    });
    if (news())
        settle();
    return Effect.sync(() => {
        done = true;
        offChange();
        offWake();
    });
});
/**
 * HTTPS live: resolve when the session's basis moves past `minT`, the
 * socket drops (`generation`), or a paint nudge moves `epoch`. Overlay
 * live does not use this — it waits on the overlay db via
 * {@link awaitOverlay}.
 */
const awaitWake = (session, generation, epoch, fence) => Effect.callback((resume) => {
    let done = false;
    const settle = () => {
        if (done)
            return;
        done = true;
        off();
        resume(Effect.void);
    };
    const news = () => (fence.minT !== undefined && session.t > fence.minT) ||
        session.generation !== generation ||
        session.epoch !== epoch;
    const off = session.onWake(() => {
        if (news())
            settle();
    });
    if (news())
        settle();
    return Effect.sync(() => {
        done = true;
        off();
    });
});
const copySeam = (from, to) => {
    const seam = from[DB_SEAM];
    if (seam !== undefined)
        to[DB_SEAM] = seam;
};
const wrapRead = (inner) => {
    const read = {
        name: inner.name,
        schema: inner.schema,
        query: ((input) => asPromise(inner.query(input))),
        live: ((input) => fromStream(inner.live(input))),
        pull: ((subject, pattern) => asPromise(inner.pull(subject, pattern))),
        livePull: ((subject, pattern) => fromStream(inner.livePull(subject, pattern))),
        basis: () => asPromise(inner.basis()),
        asOf: (t) => wrapRead(inner.asOf(t)),
        get history() {
            return wrapRead(inner.history);
        },
        effect: inner,
    };
    copySeam(inner, read);
    return read;
};
const wrapDb = (inner) => {
    const db = {
        ...wrapRead(inner),
        principal: () => asPromise(inner.principal()),
        install: (options) => asPromise(inner.install(options)),
        run: ((operation, a, b) => asPromise(operation.on !== undefined
            ? inner.run(operation, a, b)
            : inner.run(operation, a))),
        effect: inner,
    };
    copySeam(inner, db);
    return db;
};
/** @internal `ramose.db(name, catalog)`. Pure: no request, no ensure, no socket. */
export const makeDb = (wire, name, schema, view = {}) => {
    // a bad name never reaches the peer; every operation fails `InvalidRequest`
    const bad = DATABASE_NAME_RE.test(name)
        ? undefined
        : invalidDatabaseName(name);
    // remember the catalog so the first session read can install schema
    // locally — must not open a socket (db() is pure)
    wire.bindSchema?.(name, schema);
    const submit = (tx) => {
        if (bad !== undefined)
            return Effect.fail(bad);
        const overlay = wire.overlay?.(name);
        if (overlay !== undefined) {
            return overlay.transact(tx).pipe(Effect.map((ack) => ({
                t: ack.t,
                txEid: makeEid(ack.txEid),
                datomCount: ack.datomCount,
                // local confirmed db at `t` — no min-t fence, no refetch
                dbAfter: makeDb(wire, name, schema, view),
            })));
        }
        return wire.transact(name, tx).pipe(Effect.map((body) => {
            const ack = record(body);
            const t = typeof ack.t === "number" ? ack.t : 0;
            // a write advances the whole connection: standing `live` re-runs
            wire.session(name)?.bump(t);
            return {
                t,
                txEid: makeEid(typeof ack.txEid === "number" ? ack.txEid : 0),
                datomCount: Array.isArray(ack.datoms)
                    ? ack.datoms.length
                    : typeof ack.datoms === "number"
                        ? ack.datoms
                        : 0,
                dbAfter: makeDb(wire, name, schema, { ...view, minT: t }),
            };
        }));
    };
    const read = makeRead(wire, name, schema, view, bad);
    const effectDb = {
        ...read,
        principal: () => bad !== undefined
            ? Effect.fail(bad)
            : Effect.suspend(() => wire.principal(name)).pipe(Effect.map((p) => ({
                eid: p.eid === null ? null : makeEid(p.eid),
                class: p.class,
            }))),
        install: (options) => Effect.gen(function* () {
            if (bad !== undefined)
                return yield* Effect.fail(bad);
            // asOf pins the read to the peer — the overlay already has this
            // catalog applied locally, so a live query would not see the
            // installed set. A far-future t is the current basis.
            const snap = read.asOf(Number.MAX_SAFE_INTEGER);
            const [core, uniques, optionals] = yield* Effect.all([
                snap.query(installedCoreQuery),
                snap.query(installedUniqueQuery),
                snap.query(installedOptionalQuery),
            ]);
            const installed = assembleInstalled(core, uniques, optionals);
            const desired = schemaTx(schema);
            const occupied = new Set();
            for (const ns of namespacesNeedingOccupancy(desired, installed, options)) {
                const idents = occupancyIdents(installed, ns);
                if (idents.length === 0)
                    continue;
                const hit = yield* snap.query(occupancyQuery(idents));
                if (hit !== null)
                    occupied.add(ns);
            }
            const refused = checkEvolution(desired, installed, occupied, options);
            if (refused !== undefined)
                return yield* Effect.fail(refused);
            return yield* submit(installTx(desired, installed));
        }),
        run: ((operation, a, b) => Effect.suspend(() => {
            const contextual = operation.on !== undefined;
            return runOperation(wire, name, schema, view, bad, operation, contextual ? a : undefined, contextual ? b : a, makeDb);
        })),
    };
    effectDb[DB_SUBMIT] =
        submit;
    return wrapDb(effectDb);
};
//# sourceMappingURL=Db.js.map