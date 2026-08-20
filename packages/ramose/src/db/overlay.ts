/**
 * Session-client overlay: a confirmed log follower plus pending novelty
 * layers. HTTPS-only clients never construct one.
 *
 * Inbound confirmed datoms are already assigned (`t`, eids) — `applyDatoms`,
 * never `processTx`. Pending layers stay off the confirmed log and are never
 * sent to other sessions.
 */

import { Connection } from "../internal/core/conn.ts";
import { type Datom, Index, ValueTag } from "../internal/core/datom.ts";
import { Db as EngineDb } from "../internal/core/db.ts";
import { fromWireDatom, type WireDatom } from "../internal/core/log.ts";
import { Novelty } from "../internal/core/novelty.ts";
import type { Schema } from "../internal/core/schema.ts";
import {
  QueryBudgetError,
  QueryError,
  query as engineQuery,
} from "../internal/core/query/engine.ts";
import { QueryParseError } from "../internal/core/query/parse.ts";
import {
  normalizePullPattern,
  pull as enginePull,
} from "../internal/core/query/pull.ts";
import { processTx, TxError } from "../internal/core/tx.ts";
import * as Effect from "effect/Effect";
import type { AnyCatalog } from "./Catalog.ts";
import { schemaTx } from "./ensure.ts";
import {
  type DbError,
  fromResponse,
  InternalError,
  InvalidRequest,
  isDatabaseError,
  NetworkError,
  QueryBudgetExceeded,
  TxRejected,
} from "./Errors.ts";
import { record, retryTransient } from "./http.ts";
import type { Session } from "./session.ts";

export interface OverlayAck {
  readonly t: number;
  readonly txEid: number;
  readonly tempids: Record<string, number>;
  readonly datoms: WireDatom[];
  readonly datomCount: number;
  readonly clientTxId?: string;
}

export interface Overlay {
  /** Last `t` applied to confirmed state (visible txs + resync dumps). */
  readonly confirmedT: number;
  /** Bumped on overlay apply / ack / inbound tx / resync — live wakes on it. */
  readonly epoch: number;
  ready(retry?: boolean): Effect.Effect<void, DbError>;
  read(
    op: "q" | "pull",
    body: Record<string, unknown>,
  ): Effect.Effect<unknown, DbError>;
  transact(tx: readonly unknown[]): Effect.Effect<OverlayAck, DbError>;
  handlePush(frame: Record<string, unknown>): Promise<void>;
}

export interface OverlayOptions {
  readonly session: Session;
  readonly post: (
    tx: readonly unknown[],
    clientTxId: string,
  ) => Effect.Effect<unknown, DbError>;
  /** Installs catalog attrs locally so processTx / q can resolve idents. */
  readonly catalog?: AnyCatalog | undefined;
}

interface PendingLayer {
  readonly clientTxId: string;
  tx: unknown[];
  datoms: Datom[];
  tempids: Record<string, number>;
}

const TX_EID_CAP = 2 ** 42;

const asWireDatoms = (value: unknown): WireDatom[] =>
  Array.isArray(value) ? (value as WireDatom[]) : [];

const asTempids = (value: unknown): Record<string, number> => {
  if (typeof value !== "object" || value === null) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
};

const clientTxId = (): string =>
  typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `c${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const rewriteTempid = (value: unknown, ids: Record<string, number>): unknown =>
  typeof value === "string" && ids[value] !== undefined ? ids[value] : value;

const isLookupRef = (value: unknown): value is readonly [string, unknown] =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === "string" &&
  value[0].startsWith(":");

const forwardIdent = (ident: string): string => {
  const slash = ident.lastIndexOf("/");
  return slash >= 0 && ident[slash + 1] === "_"
    ? ident.slice(0, slash + 1) + ident.slice(slash + 2)
    : ident;
};

const isRefAttr = (schema: Schema | undefined, a: unknown): boolean => {
  if (schema === undefined) return false;
  if (typeof a === "number") return schema.attr(a)?.valueType === ValueTag.Ref;
  if (typeof a !== "string") return false;
  return schema.attr(forwardIdent(a))?.valueType === ValueTag.Ref;
};

/** Rewrite a tempid only in entity / ref positions — never a scalar like a title. */
const rewriteEntityForm = (
  value: unknown,
  ids: Record<string, number>,
  schema: Schema | undefined,
): unknown => {
  if (isLookupRef(value)) return value;
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return rewriteMap(value as Record<string, unknown>, ids, schema);
  }
  return rewriteTempid(value, ids);
};

const rewriteMap = (
  m: Record<string, unknown>,
  ids: Record<string, number>,
  schema: Schema | undefined,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m)) {
    if (k === ":db/id") {
      out[k] = rewriteEntityForm(v, ids, schema);
    } else if (isRefAttr(schema, k)) {
      out[k] = Array.isArray(v) && !isLookupRef(v)
        ? v.map((x) => rewriteEntityForm(x, ids, schema))
        : rewriteEntityForm(v, ids, schema);
    } else {
      out[k] = v;
    }
  }
  return out;
};

const rewriteTx = (
  tx: readonly unknown[],
  ids: Record<string, number>,
  schema: Schema | undefined,
): unknown[] =>
  tx.map((item) => {
    if (Array.isArray(item)) {
      const [op, e, a, v] = item as unknown[];
      if (op === ":db/retractEntity") return [op, rewriteEntityForm(e, ids, schema)];
      if (op === ":db/add" || op === ":db/retract") {
        const next: unknown[] = [op, rewriteEntityForm(e, ids, schema), a];
        if (item.length >= 4) {
          next.push(isRefAttr(schema, a) ? rewriteEntityForm(v, ids, schema) : v);
        }
        return next;
      }
      return item;
    }
    if (item !== null && typeof item === "object") {
      return rewriteMap(item as Record<string, unknown>, ids, schema);
    }
    return item;
  });

const factKey = (d: Datom): string => `${d.a}\0${JSON.stringify(d.v)}\0${d.op}`;

const rewriteEid = (e: number, eids: Map<number, number>): number =>
  eids.get(e) ?? e;

const rewriteDatoms = (datoms: readonly Datom[], eids: Map<number, number>): Datom[] => {
  if (eids.size === 0) return datoms as Datom[];
  return datoms.map((d) => {
    const e = rewriteEid(d.e, eids);
    const v =
      typeof d.v === "number" && eids.has(d.v) ? eids.get(d.v)! : d.v;
    return e === d.e && v === d.v ? d : { ...d, e, v };
  });
};

const classifyQuery = (err: unknown): DbError => {
  if (isDatabaseError(err)) return err;
  if (err instanceof QueryBudgetError) {
    return new QueryBudgetExceeded({
      message: err.message,
      code: err.code,
      clause: err.clause,
      cells: err.cells,
      limit: err.limit,
    });
  }
  if (err instanceof QueryParseError || err instanceof QueryError) {
    return new InvalidRequest({ message: err.message });
  }
  return new InternalError({
    message: err instanceof Error ? err.message : String(err),
  });
};

const classifyTx = (err: unknown): DbError => {
  if (isDatabaseError(err)) return err;
  if (err instanceof TxError) {
    return new TxRejected({ message: err.message, code: err.code });
  }
  return new InternalError({
    message: err instanceof Error ? err.message : String(err),
  });
};

const unknownPullAttrs = (db: EngineDb, pattern: { kind: string; attr?: string }[]): string[] => {
  const out: string[] = [];
  const walk = (p: { kind: string; attr?: string; sub?: unknown }[]): void => {
    for (const spec of p) {
      if (spec.kind !== "attr" || spec.attr === undefined || spec.attr === ":db/id") continue;
      if (db.attr(spec.attr) === undefined) out.push(spec.attr);
      if (Array.isArray(spec.sub)) walk(spec.sub as { kind: string; attr?: string; sub?: unknown }[]);
    }
  };
  walk(pattern);
  return out;
};

const overlayDb = (confirmed: EngineDb, extra: readonly Datom[]): EngineDb => {
  if (extra.length === 0) return confirmed;
  const nov = new Novelty();
  const avet = (a: number) => confirmed.schema.isAvet(a);
  const vaet = (a: number) => confirmed.schema.isVaet(a);
  nov.add(confirmed.novelty.byIndex[Index.EAVT].all(), avet, vaet);
  nov.add(extra, avet, vaet);
  let basisT = confirmed.basisT;
  for (const d of extra) if (d.t > basisT) basisT = d.t;
  return new EngineDb({
    store: confirmed.store,
    roots: confirmed.roots,
    novelty: nov,
    basisT,
    schema: confirmed.schema,
    nextEid: confirmed.nextEid,
  });
};

export const openOverlay = (options: OverlayOptions): Overlay => {
  const pending: PendingLayer[] = [];
  let conn: Connection | undefined;
  let confirmedT = 0;
  /** Last `t` at which a non-empty datom array was applied. Empty/count-only
   * acks may raise `confirmedT` without moving this, so a later inbound at
   * that same `t` can still land real facts. */
  let appliedFactsT = 0;
  let epoch = 0;
  let readyGen = -1;
  let opening: Promise<void> | undefined;
  let applied: Promise<void> = Promise.resolve();
  let outbox: Promise<unknown> = Promise.resolve();

  const enqueueApply = (fn: () => void | Promise<void>): Promise<void> => {
    const next = applied.then(fn, fn);
    applied = next.then(() => undefined, () => undefined);
    return next;
  };

  const wake = (): void => {
    epoch += 1;
    options.session.nudge();
  };

  const pendingDatoms = (): Datom[] => {
    const out: Datom[] = [];
    for (const layer of pending) out.push(...layer.datoms);
    return out;
  };

  const view = (): EngineDb => {
    if (conn === undefined) {
      throw new Error("ramose: overlay view before the follower is ready");
    }
    return overlayDb(conn.db(), pendingDatoms());
  };

  const nextEid = (): number => {
    let n = conn?.nextEntityId ?? 1000;
    for (const layer of pending) {
      for (const d of layer.datoms) {
        if (d.e < TX_EID_CAP && d.e >= n) n = d.e + 1;
      }
    }
    return n;
  };

  const applyConfirmed = (datoms: readonly Datom[], t: number): void => {
    if (conn === undefined) return;
    // Do not skip a same-`t` inbound after an empty/count-only stamp — only
    // a strictly older `t` is news we have already moved past.
    if (t < confirmedT) return;
    const fresh = datoms.filter((d) => d.t > appliedFactsT);
    if (fresh.length > 0) {
      conn.applyDatoms(fresh);
      if (t > appliedFactsT) appliedFactsT = t;
    }
    if (t > confirmedT) {
      confirmedT = t;
      options.session.bump(t);
    }
  };

  const replaceConfirmed = async (datoms: readonly Datom[], t: number): Promise<void> => {
    const next = await Connection.fromDatoms(datoms);
    if (options.catalog !== undefined) {
      await next.transact(schemaTx(options.catalog) as unknown[]);
    }
    conn = next;
    confirmedT = t;
    appliedFactsT = t;
    options.session.bump(t);
  };

  const remapQueued = (
    acked: Record<string, number>,
    local: Record<string, number>,
  ): void => {
    const eids = new Map<number, number>();
    for (const [tmp, serverEid] of Object.entries(acked)) {
      const was = local[tmp];
      if (typeof was === "number") eids.set(was, serverEid);
    }
    // only rewrite tempid *strings* a queued item referred to and did not mint
    const referred: Record<string, number> = {};
    for (const [tmp, serverEid] of Object.entries(acked)) {
      referred[tmp] = serverEid;
    }
    for (const layer of pending) {
      const foreign: Record<string, number> = {};
      for (const [tmp, serverEid] of Object.entries(referred)) {
        if (layer.tempids[tmp] === undefined) foreign[tmp] = serverEid;
      }
      if (Object.keys(foreign).length > 0) {
        layer.tx = rewriteTx(layer.tx, foreign, conn?.db().schema);
      }
      layer.datoms = rewriteDatoms(layer.datoms, eids);
      for (const [tmp, e] of Object.entries(layer.tempids)) {
        layer.tempids[tmp] = eids.get(e) ?? e;
      }
    }
  };

  const dropLayer = (clientTxId: string): PendingLayer | undefined => {
    const i = pending.findIndex((l) => l.clientTxId === clientTxId);
    if (i < 0) return undefined;
    return pending.splice(i, 1)[0];
  };

  const remapDropped = (layer: PendingLayer, incoming: readonly Datom[]): void => {
    const serverE = new Map<string, number>();
    for (const d of incoming) {
      if (d.e < TX_EID_CAP) serverE.set(factKey(d), d.e);
    }
    const eids = new Map<number, number>();
    for (const d of layer.datoms) {
      if (d.e >= TX_EID_CAP) continue;
      const e = serverE.get(factKey(d));
      if (e !== undefined && d.e !== e) eids.set(d.e, e);
    }
    const acked: Record<string, number> = {};
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
  const dropCoveredPending = (
    incoming: readonly Datom[],
    coveredId?: string,
  ): void => {
    if (typeof coveredId !== "string" || coveredId.length === 0) return;
    const layer = dropLayer(coveredId);
    if (layer !== undefined) remapDropped(layer, incoming);
  };

  const ensureConn = async (): Promise<void> => {
    if (conn !== undefined) return;
    conn = await Connection.create();
    if (options.catalog !== undefined) {
      await conn.transact(schemaTx(options.catalog) as unknown[]);
    }
  };

  const requestSync = () =>
    Effect.tryPromise({
      try: () =>
        options.session.request({
          op: "sync",
          from: confirmedT,
        }),
      catch: (cause) =>
        isDatabaseError(cause)
          ? cause
          : new NetworkError({
              message: cause instanceof Error ? cause.message : String(cause),
              cause,
            }),
    }).pipe(
      Effect.flatMap((got) =>
        got.status >= 400
          ? Effect.fail(
              fromResponse(got.status, got.body, {
                get: (h) => got.headers?.[h.toLowerCase()] ?? null,
              }),
            )
          : Effect.succeed(got),
      ),
    );

  const sync = async (retry = true): Promise<void> => {
    await ensureConn();
    const reply = await Effect.runPromise(
      retry
        ? retryTransient(requestSync, { while: () => !options.session.closed })
        : requestSync(),
    );
    readyGen = options.session.generation;
    // #112 delivers `{ op: "tx" }` frames, then the sync reply `{ t, from }`.
    // Those applies are queued on `applied`. Stamp the watermark only after
    // they run — `applyConfirmed` is `if (t <= confirmedT) return`.
    await applied;
    const t = record(reply.body).t;
    if (typeof t === "number" && t > confirmedT) {
      // reply is the only news when the gap was empty
      confirmedT = t;
      options.session.bump(t);
    }
  };

  const ready: Overlay["ready"] = (retry = true) =>
    Effect.tryPromise({
      try: async () => {
        if (readyGen !== options.session.generation || conn === undefined) {
          if (opening !== undefined) await opening;
          else {
            const started = sync(retry).finally(() => {
              if (opening === started) opening = undefined;
            });
            opening = started;
            await started;
          }
        }
        await applied;
      },
      catch: (cause) =>
        isDatabaseError(cause)
          ? cause
          : new NetworkError({
              message:
                cause instanceof Error ? cause.message : String(cause),
              cause,
            }),
    });

  const read: Overlay["read"] = (op, body) =>
    ready().pipe(
      Effect.flatMap(() =>
        Effect.tryPromise({
          try: async () => {
            const db = view();
            if (op === "pull") {
              const pattern = normalizePullPattern(body.pattern);
              const unknown = unknownPullAttrs(db, pattern as { kind: string; attr?: string }[]);
              if (unknown.length > 0) {
                throw new InvalidRequest({
                  message: `unknown attribute${unknown.length > 1 ? "s" : ""} in pull pattern: ${unknown.join(", ")}`,
                });
              }
              const subject = body.eid;
              const eid =
                typeof subject === "number"
                  ? subject
                  : await db.entid(subject as number | string | [string, unknown]);
              if (eid === undefined) return { t: confirmedT, result: null };
              return { t: confirmedT, result: await enginePull(db, eid, pattern) };
            }
            const result = await engineQuery(
              db,
              body.query as object,
              Array.isArray(body.inputs) ? body.inputs : [],
            );
            return { t: confirmedT, root: confirmedT, result };
          },
          catch: classifyQuery,
        }),
      ),
    );

  const transact: Overlay["transact"] = (tx) =>
    ready(false).pipe(
      Effect.flatMap(() =>
        Effect.gen(function* () {
          const expansion = yield* Effect.tryPromise({
            try: () =>
              processTx(
                view(),
                tx as unknown[],
                confirmedT + pending.length + 1,
                nextEid(),
                Date.now(),
              ),
            catch: classifyTx,
          });

          const id = clientTxId();
          pending.push({
            clientTxId: id,
            tx: tx as unknown[],
            datoms: expansion.datoms,
            tempids: expansion.tempids,
          });
          wake();

          const posted = yield* Effect.callback<OverlayAck, DbError>((resume) => {
            const run = () =>
              Effect.runPromise(
                options.post(
                  pending.find((l) => l.clientTxId === id)?.tx ?? (tx as unknown[]),
                  id,
                ),
              )
                .then(async (body) => {
                  const ack = record(body);
                  const t = typeof ack.t === "number" ? ack.t : 0;
                  const raw = ack.datoms;
                  const datoms = Array.isArray(raw) ? (raw as WireDatom[]) : [];
                  const tempids = asTempids(ack.tempids);
                  // Join `applied` the same way inbound `{ op: "tx" }` does.
                  // An HTTP ack that stamps `confirmedT` off the queue can
                  // skip a queued earlier frame (`t <= confirmedT`); sync
                  // then uses `from: confirmedT` and that `t` never returns.
                  await enqueueApply(() => {
                    const layer = dropLayer(id);
                    // Confirmed follows the sieved server log. Apply only a
                    // real `WireDatom[]`. A number is datomCount, never facts
                    // (and never the local processTx expansion).
                    if (Array.isArray(raw)) {
                      applyConfirmed(datoms.map(fromWireDatom), t);
                    } else {
                      applyConfirmed([], t);
                    }
                    if (layer !== undefined) remapQueued(tempids, layer.tempids);
                    wake();
                  });
                  resume(
                    Effect.succeed({
                      t,
                      txEid: typeof ack.txEid === "number" ? ack.txEid : 0,
                      tempids,
                      datoms,
                      datomCount:
                        datoms.length > 0
                          ? datoms.length
                          : typeof ack.datoms === "number"
                            ? ack.datoms
                            : 0,
                      clientTxId:
                        typeof ack.clientTxId === "string" ? ack.clientTxId : id,
                    }),
                  );
                })
                .catch(async (err) => {
                  await enqueueApply(() => {
                    dropLayer(id);
                    wake();
                  });
                  resume(
                    Effect.fail(isDatabaseError(err) ? err : classifyTx(err)),
                  );
                });
            const next = outbox.then(run, run);
            outbox = next.catch(() => undefined);
            return Effect.void;
          });
          return posted;
        }),
      ),
    );

  const handlePush = async (frame: Record<string, unknown>): Promise<void> => {
    await enqueueApply(async () => {
      await ensureConn();
      const t = typeof frame.t === "number" ? frame.t : 0;
      if (frame.op === "resync") {
        pending.length = 0;
        const datoms = asWireDatoms(frame.datoms).map(fromWireDatom);
        await replaceConfirmed(datoms, t);
        wake();
        return;
      }
      if (frame.op === "tx") {
        const incoming = asWireDatoms(frame.datoms).map(fromWireDatom);
        applyConfirmed(incoming, t);
        dropCoveredPending(
          incoming,
          typeof frame.clientTxId === "string" ? frame.clientTxId : undefined,
        );
        wake();
      }
    });
  };

  options.session.onPush(handlePush);

  return {
    get confirmedT() {
      return confirmedT;
    },
    get epoch() {
      return epoch;
    },
    ready,
    read,
    transact,
    handlePush,
  };
};
