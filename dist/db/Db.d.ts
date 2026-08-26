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
import type { EffectDb, EffectOf, EffectReadDb } from "./effect-types.ts";
import type { AnySchema } from "./Schema.ts";
import { type Eid } from "./Eid.ts";
import { type DbError, type InstallOptions, NotOne } from "./Errors.ts";
export { IncompatibleSchema } from "./Errors.ts";
export type { InstallOptions, SchemaChange } from "./Errors.ts";
import type { AnyEntity } from "./Entity.ts";
import type { AnyOperation, OpReport, Operation, OperationInvocation, RunArg, RunEntity } from "./Operation.ts";
import type { EntityRef } from "./idents.ts";
import { type AnyQueryObject, type Page, type QueryObject } from "./query/index.ts";
import type { SessionPrincipal } from "./session.ts";
import { type IdentPullPattern, type Pull, type ValidatePull } from "./Pull.ts";
import type { ConnectionStatus, Session } from "./session.ts";
import type { Subscription } from "./subscription.ts";
/**
 * What `db.query` / `db.live` can fail with. `.oneOrFail()` adds {@link NotOne}
 * when the peer answers zero or two rows. Every other query — a rows array,
 * `.one()`'s `row | null`, a cursor {@link Page}, a scalar aggregate — is
 * {@link DbError} only.
 */
export type QueryError<R = unknown> = ([R] extends [readonly unknown[]] ? DbError : [null] extends [R] ? DbError : [R] extends [number] ? DbError : [R] extends [Page<unknown>] ? DbError : DbError | NotOne);
/**
 * @internal What a `Db` needs from the outside world. Supplied by
 * the hatch factory; deliberately not a public name — HTTP is Worker internals.
 */
export interface Wire {
    /** A read op: one session frame, or one HTTPS POST when there is no socket. */
    read(name: string, op: "q" | "pull", body: Record<string, unknown>, minT: number | undefined): EffectOf<unknown, DbError>;
    /** `POST /db/:name/transact`. Raw writer — admin / seed / `writes: "all"`. */
    transact(name: string, tx: readonly unknown[], clientTxId?: string): EffectOf<unknown, DbError>;
    /** `POST /db/:name/op`. The operations writer, always over HTTPS. */
    operation(name: string, invocation: OperationInvocation): EffectOf<unknown, DbError>;
    /**
     * Session overlay — confirmed follower + pending layers. Absent on an
     * HTTPS-only client, where reads stay on the peer and writes have no
     * optimistic layer. `makeDb` binds the catalog without opening a socket.
     */
    bindSchema?(name: string, schema: AnySchema): void;
    overlay?(name: string): {
        transact(tx: readonly unknown[]): EffectOf<{
            readonly t: number;
            readonly txEid: number;
            readonly datoms: unknown;
            readonly datomCount: number;
        }, DbError>;
        run(args: {
            readonly invocation: OperationInvocation;
            readonly operation: AnyOperation;
            readonly schema: AnySchema;
            readonly principal: {
                readonly eid: number | null;
                readonly class: string;
            };
            readonly db: string;
        }): EffectOf<{
            readonly t: number;
            readonly txEid: number;
            readonly datomCount: number;
            readonly output: unknown;
            readonly clientOpId: string;
        }, DbError>;
        /** View-visible mutation generation — captured at `view()`, not before the pass. */
        readonly epoch: number;
        /** Subscribe to overlay apply (pending / ack / inbound tx / resync). */
        onChange(cb: () => void): () => void;
    } | undefined;
    /** `GET /db/:name/info` — where the basis is. Always HTTPS: cheap, authoritative. */
    info(name: string): EffectOf<unknown, DbError>;
    /**
     * Who this connection is: `/info`'s `principal`, cached per session
     * generation — re-read on reconnect, and never cached while `eid` is `null`
     * (the row may be written at any moment).
     */
    principal(name: string): EffectOf<SessionPrincipal, DbError>;
    /** This database's session, opened lazily; `undefined` with no `WebSocket`. */
    session(name: string): Session | undefined;
}
/**
 * Who a session is, as the peer reports it: the principal's entity — `null`
 * until the policy's principal attribute has a row for this `sub` — and its
 * class (`"admin"` on a peer with no policy configured).
 */
export interface DbPrincipal<C extends AnySchema = AnySchema> {
    readonly eid: Eid<C> | null;
    readonly class: string;
}
/** What a committed transaction reports back. `dbAfter` reads your own writes. */
export interface TxReport<C extends AnySchema = AnySchema> {
    readonly t: number;
    readonly txEid: Eid<C>;
    readonly datomCount: number;
    /** The same db after the write — overlay at `t`, or a min-`t` fence on HTTPS. */
    readonly dbAfter: Db<C>;
}
/**
 * The pull pattern a subject accepts: a literate map, `Ramose.all(N)` (the
 * peer's wildcard row), or the ident-array escape.
 */
type PullPattern<C extends AnySchema, P> = [P] extends [readonly unknown[]] ? P & IdentPullPattern<C> : ValidatePull<C, P>;
export interface ReadDb<C extends AnySchema = AnySchema> {
    readonly name: string;
    readonly schema: C;
    /** Run a {@link QueryObject} once. Put values in the query
     * (`where({ title })`). The result is the query's terminal: the rows
     * array, one row (or `null`) after `one()` / `oneOrFail()`, a `Page`
     * after `after(cursor)`, a scalar after `Q.value(...)`. */
    query<Row, Out = readonly Row[]>(input: QueryObject<Row, Out>): Promise<Out>;
    /**
     * Stand a query up. On an overlay session, re-run when that overlay
     * mutates (`{ op: "tx" }` / `{ op: "resync" }` / local write) —
     * apply is the notify. HTTPS live (no overlay) still re-runs when the
     * session's `t` moves. A pinned view (`asOf` / `history`) emits once and
     * completes. A pass that returns the rows already emitted is not
     * emitted again: a write this query does not see is not a re-render.
     * Put values in the query.
     */
    live<Row, Out = readonly Row[]>(input: QueryObject<Row, Out>): Subscription<Out, QueryError<Out>>;
    /**
     * Project one entity. `null` when a required field is missing. The subject
     * is the shared {@link EntityRef} vocabulary — a branded eid, `{ id }`
     * row, tempid, lookup, or unbranded number.
     */
    pull<const P>(subject: EntityRef<C>, pattern: PullPattern<C, P>): Promise<Pull<C, P> | null>;
    /**
     * Stand a pull up: `live`'s exact contract over one entity. Overlay
     * re-runs when that overlay mutates; HTTPS live still fences on `t`.
     * Deduped by digest.
     * `null` (entity gone, or a required field missing) is a legitimate
     * emission — a retracted entity emits `null` and keeps standing. A
     * pinned view (`asOf` / `history`) emits once and completes.
     */
    livePull<const P>(subject: EntityRef<C>, pattern: PullPattern<C, P>): Subscription<Pull<C, P> | null, DbError>;
    /**
     * The basis this view reads at: for a live db, the peer's current `t`
     * (one `GET /db/:name/info`); for `asOf(t)`, `t` with no I/O. Observing a
     * newer basis bumps the session, so a standing `live` that missed a tick
     * re-runs — the same rule as a write.
     */
    basis(): Promise<{
        readonly t: number;
    }>;
    /** Read-only view as of transaction `t`. Pure. */
    asOf(t: number): ReadDb<C>;
    /** History view — asserts *and* retracts. Pure. */
    readonly history: ReadDb<C>;
    /**
     * Effect-returning variants of these methods (`Effect` / `Stream`).
     * Import `ramose/db/effect` for `layer` / `Databases`.
     */
    readonly effect: EffectReadDb<C>;
}
export interface Db<C extends AnySchema = AnySchema> extends ReadDb<C> {
    /**
     * Who this session is — the peer resolves `sub → eid` at its end, so no
     * query is needed to learn your own entity. A signed-in user is provisioned
     * at session establishment (`sub`, `role`, matching `ramose.attrs`). `eid`
     * is `null` for anonymous and service callers; a `null` is never cached.
     * A non-`null` answer is cached per session generation and re-read on
     * reconnect.
     */
    principal(): Promise<DbPrincipal<C>>;
    /**
     * Idempotent catalog upsert, as an ordinary transaction. Reads the
     * installed fields first and fails with {@link IncompatibleSchema} when a
     * value type, cardinality, uniqueness, or a new required field on
     * existing rows would change. Pass `{ allowIncompatible: [":ident"] }`
     * to apply those idents anyway.
     */
    install(options?: InstallOptions): Promise<TxReport<C>>;
    /**
     * Run a named operation. Decode input, apply the optimistic prefix (steps
     * before the first `op.effect`) as a pending layer, and POST the invocation.
     * A contextual operation (`on: Entity`) takes the entity as the second
     * argument. A *branded* cell of the wrong entity is rejected; an unbranded
     * number and a nominal `tempid("ada")` are deliberate hatches.
     * Lookups must use a unique attr of the `on` entity.
     *
     * A schema-less operation runs on any db. An operation bound with
     * `schema:` runs on a db that has at least that catalog's entity keys.
     */
    run<I, O, OC extends AnySchema = AnySchema>(operation: Operation<string, I, O, undefined, OC>, input: RunArg<C, OC, I>): Promise<OpReport<O, C>>;
    run<I, O, N extends AnyEntity, OC extends AnySchema = AnySchema>(operation: Operation<string, I, O, N, OC>, entity: RunArg<C, OC, RunEntity<C, N>>, input: I): Promise<OpReport<O, C>>;
    readonly effect: EffectDb<C>;
}
/** The coordinates a read view carries. `minT` is the `dbAfter` floor. */
interface View {
    readonly asOf?: number | undefined;
    readonly history?: boolean | undefined;
    readonly minT?: number | undefined;
}
/**
 * @internal What `ramose/react`'s hooks need that the public surface
 * deliberately does not say: a **structural** identity for a view (so
 * `db.asOf(t)` built inline in a render compares equal across renders
 * instead of re-subscribing — or looping — on every one), the pinned
 * coordinate (so `useBasis` answers an `asOf` view with no request), and the
 * session's wake (so `useBasis` re-reads the basis on every paint).
 *
 * It rides a registry symbol rather than an export so the public barrel
 * stays exactly what `db-portable.test.ts` asserts. The reader lives in
 * `packages/ramose/src/react/seam.ts` and must stay shape-compatible with this.
 */
export interface DbSeam {
    /**
     * Equal iff two views read the same coordinates over the same client.
     * This is the view half of a live subscription key:
     * `(viewKey, astKey)`.
     */
    readonly key: string;
    /** `asOf(t)`'s `t`; `undefined` on a live (or history) view. */
    readonly asOf: number | undefined;
    /**
     * Subscribe to the session's wakes (tx/resync, local writes, drops).
     * Returns the unsubscribe, or `undefined` on an HTTPS-only client, where
     * there is nothing to wake on.
     */
    readonly onWake: (cb: () => void) => (() => void) | undefined;
    /**
     * The highest basis the session has seen, `undefined` without a session —
     * so a waker can tell a wake that carries news from one it caused itself
     * (observing the basis bumps the session).
     */
    readonly t: () => number | undefined;
    /**
     * Session generation — 0 before a socket exists. A reconnect after a
     * terminal live error is new information.
     */
    readonly generation: () => number;
    /**
     * `"offline"` with no socket factory; otherwise the session's
     * {@link ConnectionStatus} (`"connecting"` until the first handshake).
     */
    readonly status: () => ConnectionStatus;
    /**
     * Standing query that emits the raw wire result — no take-unwrap, no
     * page-wrap. `useLive` shares this handle and applies each subscriber's
     * `finalize`.
     */
    readonly liveRaw: (query: AnyQueryObject) => Subscription<unknown, unknown>;
}
/** @internal The registry key {@link DbSeam} is attached under. */
export declare const DB_SEAM: symbol;
/**
 * @internal Raw `POST /transact` submit — admin / seed / test. Not on the
 * public `Db` or `EffectDb` shapes. App writes use {@link Db.run}.
 */
export declare const DB_SUBMIT: unique symbol;
/** @internal `ramose.db(name, catalog)`. Pure: no request, no ensure, no socket. */
export declare const makeDb: <C extends AnySchema>(wire: Wire, name: string, schema: C, view?: View) => Db<C>;
//# sourceMappingURL=Db.d.ts.map