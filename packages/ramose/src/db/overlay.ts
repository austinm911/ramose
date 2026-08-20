/**
 * Session-client overlay: a confirmed log follower plus pending novelty
 * layers. HTTPS-only clients never construct one.
 *
 * Inbound confirmed datoms are already assigned (`t`, eids) — `applyDatoms`,
 * never `processTx`. Pending layers stay off the confirmed log and are never
 * sent to other sessions.
 */

import { Connection } from "../internal/core/conn.ts";
import { type Datom, Index } from "../internal/core/datom.ts";
import { Db as EngineDb } from "../internal/core/db.ts";
import { fromWireDatom, type WireDatom } from "../internal/core/log.ts";
import { Novelty } from "../internal/core/novelty.ts";
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
import { record } from "./http.ts";
import type { Session } from "./session.ts";

export interface OverlayAck {
  readonly t: number;
  readonly txEid: number;
  readonly tempids: Record<string, number>;
  readonly datoms: WireDatom[];
  readonly clientTxId?: string;
}

export interface Overlay {
  /** Last `t` applied to confirmed state (visible txs + resync dumps). */
  readonly confirmedT: number;
  /** Bumped on overlay apply / ack / inbound tx / resync — live wakes on it. */
  readonly epoch: number;
  ready(): Effect.Effect<void, DbError>;
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

const rewriteDeep = (value: unknown, ids: Record<string, number>): unknown => {
  if (typeof value === "string" && ids[value] !== undefined) return ids[value];
  if (Array.isArray(value)) return value.map((v) => rewriteDeep(v, ids));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = rewriteDeep(v, ids);
    }
    return out;
  }
  return value;
};

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
  let epoch = 0;
  let readyGen = -1;
  let opening: Promise<void> | undefined;
  let outbox: Promise<unknown> = Promise.resolve();

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
    if (t <= confirmedT) return;
    const fresh = datoms.filter((d) => d.t > confirmedT);
    if (fresh.length > 0) conn.applyDatoms(fresh);
    confirmedT = t;
    options.session.bump(t);
  };

  const replaceConfirmed = async (datoms: readonly Datom[], t: number): Promise<void> => {
    conn = await Connection.fromDatoms(datoms);
    confirmedT = t;
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
        layer.tx = rewriteDeep(layer.tx, foreign) as unknown[];
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

  const ensureConn = async (): Promise<void> => {
    if (conn === undefined) conn = await Connection.create();
  };

  const sync = async (): Promise<void> => {
    await ensureConn();
    const gen = options.session.generation;
    const reply = await options.session.request({
      op: "sync",
      from: confirmedT,
    });
    if (reply.status >= 400) {
      throw fromResponse(reply.status, reply.body, {
        get: (h) => reply.headers?.[h.toLowerCase()] ?? null,
      });
    }
    const t = record(reply.body).t;
    if (typeof t === "number" && t > confirmedT) {
      // a sync reply may be the only news when the gap was empty
      confirmedT = t;
      options.session.bump(t);
    }
    readyGen = gen;
  };

  const ready: Overlay["ready"] = () =>
    Effect.tryPromise({
      try: () => {
        if (readyGen === options.session.generation && conn !== undefined) {
          return Promise.resolve();
        }
        if (opening !== undefined) return opening;
        const started = sync().finally(() => {
          if (opening === started) opening = undefined;
        });
        opening = started;
        return started;
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
    ready().pipe(
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
                .then((body) => {
                  const ack = record(body);
                  const t = typeof ack.t === "number" ? ack.t : 0;
                  const datoms = asWireDatoms(ack.datoms);
                  const tempids = asTempids(ack.tempids);
                  const layer = dropLayer(id);
                  applyConfirmed(
                    datoms.length > 0
                      ? datoms.map(fromWireDatom)
                      : (layer?.datoms ?? []),
                    t,
                  );
                  if (layer !== undefined) remapQueued(tempids, layer.tempids);
                  wake();
                  resume(
                    Effect.succeed({
                      t,
                      txEid: typeof ack.txEid === "number" ? ack.txEid : 0,
                      tempids,
                      datoms,
                      clientTxId:
                        typeof ack.clientTxId === "string" ? ack.clientTxId : id,
                    }),
                  );
                })
                .catch((err) => {
                  dropLayer(id);
                  wake();
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
      applyConfirmed(asWireDatoms(frame.datoms).map(fromWireDatom), t);
      wake();
    }
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
