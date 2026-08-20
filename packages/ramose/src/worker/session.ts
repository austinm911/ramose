/** Session socket: Worker-accepted WS, frames dispatched into existing HTTP routes. */

import type { Principal, WireDatom } from "../internal/core/index.ts";
import type { SessionLog, SessionLogEntry, SessionTxDecision } from "./session-sync.ts";

// ---- wire ------------------------------------------------------------------

/** A frame from the client. `id` correlates the reply; ops mirror the HTTP routes. */
export type ClientFrame =
  /** token refresh — the only frame that is not a sub-request */
  | { id: number; op: "auth"; token: string }
  | { id: number; op: "transact"; tx: unknown[]; clientTxId?: string }
  /** catch-up: walk `(from, now]` and skip empties; resync if the gap is gone or a rule view flipped */
  | { id: number; op: "sync"; from: number }
  | { id: number; op: "q"; query: string | object; inputs?: unknown[]; asOf?: number; history?: boolean; explain?: boolean; minT?: number }
  | { id: number; op: "pull"; eid: number | string | [string, unknown]; pattern: string | unknown[]; asOf?: number; history?: boolean; minT?: number }
  | { id: number; op: "entity"; eid: number; asOf?: number }
  | { id: number; op: "info" };

/** One reply per client frame. `id` is 0 when the frame was too malformed to carry one. */
export interface ReplyFrame {
  id: number;
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

/** Who a session is, as the wire tells it: `eid` is `null` when the policy's principal attribute has no row yet. */
export interface WirePrincipal {
  eid: number | null;
  class: string;
}

/** The `auth` frame's success reply: the principal was swapped (and, when the session can describe it, who it now is). */
export interface AuthAck {
  id: number;
  ok: true;
  principal?: WirePrincipal;
}

/** Unsolicited: the basis this session reads from has moved to `t`. */
export interface TickFrame {
  op: "t";
  t: number;
}

/** Unsolicited: facts this principal may read from one committed tx. */
export interface TxPushFrame {
  op: "tx";
  t: number;
  datoms: WireDatom[];
}

/** Unsolicited: this principal's rule view flipped — drop local state and sieve current. */
export interface ResyncFrame {
  op: "resync";
  t: number;
  datoms?: WireDatom[];
}

/** Diagnostic response headers worth carrying back on a reply (the `x-ramose-*` set the routes set). */
export const META_HEADERS: readonly string[] = [
  "x-ramose-ms",
  "x-ramose-r2-gets",
  "x-ramose-cache-hits",
  "x-ramose-basis-t",
  "x-ramose-basis-hit",
  "x-ramose-basis-reason",
  "x-ramose-basis-calls",
  "x-ramose-basis-behind",
  "x-ramose-replica-hint",
  "x-ramose-cache-basis",
  "x-ramose-cache-mode",
  "x-ramose-colo",
];

// ---- seams -----------------------------------------------------------------

/** The bits of a `WebSocket` a session uses (a Workers server socket after `accept()`). */
export interface SocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "message" | "close" | "error", cb: (ev: any) => void): void;
}

/** Runs one planned frame against the Worker's own routes; never rejects for a non-2xx. */
export type SessionDispatch = (rest: string, init: { method: string; headers: Record<string, string>; body?: string }, principal?: Principal) => Promise<Response>;

/** `setInterval`-shaped; returns its own cancel. */
export type Scheduler = (fn: () => void, ms: number) => () => void;

export interface SessionOptions {
  dispatch: SessionDispatch;
  /** the principal from the upgrade (`?token=` / `Authorization`) */
  principal?: Principal;
  /** re-verify a token for this same database; rejects when it is refused */
  authenticate?: (token: string) => Promise<Principal>;
  /** `{ eid, class }` for the `auth` ack — the swapped principal's entity, `null` when its row does not exist yet */
  describe?: (principal: Principal) => Promise<WirePrincipal>;
  /** reads the current basis `t` (isolate-local, cache-bypassing) — omit to disable polling */
  pollBasis?: () => Promise<number>;
  /**
   * richer poll: novelty since the current root. When set (with {@link filterEntry}),
   * the session walks a filtered log instead of ticking every `t`.
   */
  pollLog?: () => Promise<SessionLog>;
  /** sieve one unfiltered log entry for this socket's current principal */
  filterEntry?: (entry: SessionLogEntry, principal?: Principal) => Promise<SessionTxDecision>;
  /** current-value dump through the read view — first sync / resync */
  snapshot?: (principal?: Principal) => Promise<{ t: number; datoms: WireDatom[] }>;
  /** sessions sharing this key share one basis reading (the read path's `db|hint`) */
  watchKey?: string;
  pollIntervalMs?: number;
  schedule?: Scheduler;
  /** clock seam for tests */
  now?: () => number;
}

export interface Session {
  /** Handle one inbound frame. Never rejects; concurrent calls are fine (frames are not serialized). */
  onMessage(data: string | ArrayBuffer): Promise<void>;
  /** Send `{ op: "t", t }` if this is news to this socket. */
  notifyT(t: number): void;
  close(): void;
  /** Highest `t` this socket has been told about (does not advance on a skipped empty). */
  readonly lastT: number;
  /** Highest `t` this session has considered, including skipped empties. */
  readonly watermark: number;
  /** Resolves when the socket is closed or errors (index.ts holds the request open with it). */
  readonly closed: Promise<void>;
}

export const DEFAULT_POLL_INTERVAL_MS = 1_000;

const defaultSchedule: Scheduler = (fn, ms) => {
  const handle = setInterval(fn, ms);
  return () => clearInterval(handle as unknown as number);
};

// ---- planning --------------------------------------------------------------

/** A frame, resolved to the sub-request that answers it. */
export interface SessionPlan {
  id: number;
  op: ClientFrame["op"];
  /** path under `/db/:name` — may carry a query string (`/entity/7?asOf=3`) */
  rest: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

/** A frame that could not be planned; answered with a 400 reply (the socket stays open). */
export interface PlanError {
  id: number | undefined;
  error: string;
}

const JSON_CT = { "content-type": "application/json" };

/** `x-ramose-min-t` when the caller carries a fence, nothing otherwise. */
const minTHeader = (v: unknown): Record<string, string> =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? { "x-ramose-min-t": String(v) } : {};

const isPlanError = (p: SessionPlan | PlanError): p is PlanError => (p as PlanError).error !== undefined;

/** Past `exp`: every frame is denied and the socket closes on the next tick. */
const expired = (p: Principal): boolean => p.claims.exp !== undefined && p.claims.exp * 1000 <= Date.now();

/**
 * Frame → sub-request. Pure, and the only place the wire ops map onto routes.
 * Payloads are re-serialized verbatim: whatever encoding the client used for
 * `tx`/`query`/`pattern` is what the route's own `fromJson` sees.
 */
export function planOf(frame: unknown): SessionPlan | PlanError {
  if (typeof frame !== "object" || frame === null || Array.isArray(frame)) return { id: undefined, error: "frame must be an object" };
  const f = frame as Record<string, unknown>;
  if (typeof f.id !== "number" || !Number.isFinite(f.id)) return { id: undefined, error: "frame.id must be a number" };
  const id = f.id;
  switch (f.op) {
    case "transact": {
      if (!Array.isArray(f.tx)) return { id, error: "transact frame needs tx: unknown[]" };
      const body: Record<string, unknown> = { tx: f.tx };
      if (typeof f.clientTxId === "string" && f.clientTxId.length > 0) body.clientTxId = f.clientTxId;
      return { id, op: "transact", rest: "/transact", method: "POST", headers: { ...JSON_CT }, body: JSON.stringify(body) };
    }
    case "q": {
      if (f.query === undefined || f.query === null) return { id, error: "q frame needs query" };
      if (f.inputs !== undefined && !Array.isArray(f.inputs)) return { id, error: "q frame inputs must be an array" };
      const body: Record<string, unknown> = { query: f.query };
      if (f.inputs !== undefined) body.inputs = f.inputs;
      if (typeof f.asOf === "number") body.asOf = f.asOf;
      if (f.history !== undefined) body.history = !!f.history;
      if (f.explain !== undefined) body.explain = !!f.explain;
      return { id, op: "q", rest: "/query", method: "POST", headers: { ...JSON_CT, ...minTHeader(f.minT) }, body: JSON.stringify(body) };
    }
    case "pull": {
      if (f.eid === undefined || f.eid === null) return { id, error: "pull frame needs eid" };
      if (f.pattern === undefined || f.pattern === null) return { id, error: "pull frame needs pattern" };
      const body: Record<string, unknown> = { eid: f.eid, pattern: f.pattern };
      if (typeof f.asOf === "number") body.asOf = f.asOf;
      if (f.history !== undefined) body.history = !!f.history;
      return { id, op: "pull", rest: "/pull", method: "POST", headers: { ...JSON_CT, ...minTHeader(f.minT) }, body: JSON.stringify(body) };
    }
    case "entity": {
      if (typeof f.eid !== "number" || !Number.isInteger(f.eid) || f.eid < 0) return { id, error: "entity frame needs eid: number" };
      const asOf = typeof f.asOf === "number" ? `?asOf=${encodeURIComponent(String(f.asOf))}` : "";
      return { id, op: "entity", rest: `/entity/${f.eid}${asOf}`, method: "GET", headers: {} };
    }
    case "info":
      return { id, op: "info", rest: "/info", method: "GET", headers: {} };
    default:
      return { id, error: `unknown op: ${typeof f.op === "string" ? f.op : String(f.op)}` };
  }
}

// ---- shared basis readings (one per db|hint per isolate, refcounted) --------
//
// Every session runs its own poll timer, created inside `openSession` — that
// is, inside the session's own WS-upgrade request context — so the poll's
// sub-request and the `socket.send` it triggers are always I/O this session is
// allowed to perform. A single shared timer fanning `{op:"t"}` out to every
// subscribed socket runs in whichever request context created it, and workerd
// forbids touching another request's socket from there ("Cannot perform I/O on
// behalf of a different request"); the send throws, and the session it was
// meant for dies. It also ties every session's ticks to the lifetime of the
// owning request: when that session closes, the timer dies with its context
// and the survivors silently stop hearing about the basis.
//
// What sessions on one key *do* share is the reading: a context-free
// `{ t, at }` snapshot of the basis, so N sessions on one db still cost about
// one replica poll per interval, not N. A session whose timer fires while the
// reading is fresh (or while another session's poll is in flight) reads the
// snapshot instead of polling, at the price of learning about movement up to
// one interval later than the session that polled.

interface BasisReading {
  /** highest basis `t` any session on this key has observed */
  t: number;
  rootT: number;
  entries: SessionLogEntry[];
  /** when `t` was last confirmed by a poll (0: never) */
  at: number;
  /** a poll started then is in flight (0: none) — a stale mark self-heals after one interval */
  pollingSince: number;
  /** sessions currently subscribed; the last one out deletes the entry */
  refs: number;
}

const readings = new Map<string, BasisReading>();

/** Test hook: the live watch keys (a session that closed must not leave one behind). */
export function watcherKeys(): string[] {
  return [...readings.keys()];
}

// ---- the session ------------------------------------------------------------

/** Wire an accepted socket to the Worker's routes. Returns the session (also driven by the socket's own events). */
export function openSession(socket: SocketLike, options: SessionOptions): Session {
  let lastT = 0;
  /** last `t` considered, including skipped empties — must not leak via `lastT` */
  let watermark = 0;
  let dead = false;
  let principal = options.principal;
  let expiring = false;
  let unsubscribe: (() => void) | undefined;
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  const filtered = options.pollLog !== undefined && options.filterEntry !== undefined;

  const die = () => {
    if (dead) return;
    dead = true;
    unsubscribe?.();
    unsubscribe = undefined;
    resolveClosed();
  };

  const shutdown = () => {
    const wasDead = dead;
    die();
    if (!wasDead) socket.close(1008, "unauthorized");
  };

  const send = (frame: ReplyFrame | TickFrame | TxPushFrame | ResyncFrame | AuthAck) => {
    if (dead) return;
    try {
      socket.send(JSON.stringify(frame));
    } catch {
      // the socket went away between the check and the send, or the runtime
      // refused the write — never leave a zombie: close so the client sees the
      // session end and reconnects instead of waiting forever on dropped frames
      die();
      try {
        socket.close(1011, "session send failed");
      } catch {
        /* already gone */
      }
    }
  };

  const notifyT = (t: number) => {
    if (dead || typeof t !== "number" || !Number.isFinite(t) || t <= lastT) return;
    lastT = t;
    send({ op: "t", t });
  };

  const pushResync = async (t: number): Promise<void> => {
    if (options.snapshot) {
      const snap = await options.snapshot(principal);
      send({ op: "resync", t: snap.t, datoms: snap.datoms });
      notifyT(snap.t);
      watermark = Math.max(watermark, snap.t, t);
      return;
    }
    send({ op: "resync", t });
    notifyT(t);
    watermark = Math.max(watermark, t);
  };

  const consider = async (log: SessionLog, from: number): Promise<void> => {
    if (dead) return;
    if (from < log.rootT) {
      await pushResync(log.t);
      return;
    }
    const filter = options.filterEntry;
    if (!filter) {
      if (log.t > lastT) notifyT(log.t);
      watermark = Math.max(watermark, log.t);
      return;
    }
    for (const e of log.entries) {
      if (e.t <= from) continue;
      const decision = await filter(e, principal);
      if (decision.kind === "skip") {
        watermark = Math.max(watermark, e.t);
        continue;
      }
      if (decision.kind === "resync") {
        await pushResync(e.t);
        watermark = Math.max(watermark, e.t, log.t);
        return;
      }
      // `kind: "tx"` without `datoms` is a sieve bug. Never send the replica
      // entry — that is the unfiltered log.
      if (decision.datoms === undefined) throw new Error("session filter returned tx without datoms");
      watermark = Math.max(watermark, e.t);
      send({ op: "tx", t: e.t, datoms: decision.datoms });
      notifyT(e.t);
    }
  };

  const failSieve = (): void => {
    if (dead) return;
    die();
    try {
      socket.close(1011, "session filter failed");
    } catch {
      /* already gone */
    }
  };

  let considering: Promise<void> = Promise.resolve();
  /** Walk the log. A filter/snapshot throw rejects — callers must not treat it as silence. */
  const enqueueConsider = (log: SessionLog, from: number): Promise<void> => {
    const run = considering.then(() => consider(log, from));
    considering = run.catch(() => undefined);
    return run;
  };

  /** `{op:"auth", token}`: re-verify, then swap. A refusal keeps the old principal. */
  const refresh = async (f: Record<string, unknown>): Promise<void> => {
    const id = typeof f.id === "number" && Number.isFinite(f.id) ? f.id : 0;
    if (!options.authenticate) {
      send({ id, status: 400, body: { error: "this session cannot re-authenticate" } });
      return;
    }
    try {
      principal = await options.authenticate(typeof f.token === "string" ? f.token : "");
      let who: WirePrincipal | undefined;
      if (options.describe !== undefined) {
        try {
          who = await options.describe(principal);
        } catch {
          // a transient replica error must not fail the swap; the ack just cannot name the entity
          who = { eid: null, class: principal.class };
        }
      }
      send({ id, ok: true, ...(who === undefined ? {} : { principal: who }) });
    } catch (err) {
      const e = err as { status?: number; code?: string; message?: string };
      send({ id, status: typeof e?.status === "number" ? e.status : 401, body: { error: e?.message || "unauthorized", ...(typeof e?.code === "string" ? { code: e.code } : {}) } });
    }
  };

  const onMessage = async (data: string | ArrayBuffer): Promise<void> => {
    if (dead) return;
    let frame: unknown;
    try {
      frame = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data));
    } catch {
      send({ id: 0, status: 400, body: { error: "frame must be JSON" } });
      return;
    }
    if (typeof frame === "object" && frame !== null && (frame as { op?: unknown }).op === "auth") {
      return refresh(frame as Record<string, unknown>);
    }
    if (typeof frame === "object" && frame !== null && (frame as { op?: unknown }).op === "sync") {
      const f = frame as Record<string, unknown>;
      const id = typeof f.id === "number" && Number.isFinite(f.id) ? f.id : 0;
      const from = typeof f.from === "number" && Number.isFinite(f.from) && f.from >= 0 ? f.from : 0;
      if (!options.pollLog) {
        send({ id, status: 400, body: { error: "this session cannot sync a log" } });
        return;
      }
      try {
        const log = await options.pollLog();
        watermark = from;
        await enqueueConsider(log, from);
        send({ id, status: 200, body: { t: log.t, from } });
      } catch (err) {
        send({ id, status: 500, body: { error: err instanceof Error ? err.message : String(err) } });
        failSieve();
      }
      return;
    }
    const plan = planOf(frame);
    if (isPlanError(plan)) {
      send({ id: plan.id ?? 0, status: 400, body: { error: plan.error } });
      return;
    }
    // the principal is bound at plan time: frames planned after an `auth` ack use
    // the new one, in-flight ones finish under the old
    const bound = principal;
    if (bound !== undefined && expired(bound)) {
      send({ id: plan.id, status: 401, body: { error: "token expired" } });
      if (!expiring) {
        expiring = true;
        setTimeout(shutdown, 0);
      }
      return;
    }
    let res: Response;
    try {
      res = await options.dispatch(plan.rest, { method: plan.method, headers: plan.headers, body: plan.body }, bound);
    } catch (err) {
      send({ id: plan.id, status: 500, body: { error: err instanceof Error ? err.message : String(err) } });
      return;
    }
    let body: unknown;
    try {
      const text = await res.text();
      try {
        body = JSON.parse(text);
      } catch {
        body = text; // an upstream pass-through that was never JSON
      }
    } catch (err) {
      send({ id: plan.id, status: 500, body: { error: err instanceof Error ? err.message : String(err) } });
      return;
    }
    const headers: Record<string, string> = {};
    for (const h of META_HEADERS) {
      const v = res.headers.get(h);
      if (v !== null) headers[h] = v;
    }
    send({ id: plan.id, status: res.status, body, ...(Object.keys(headers).length > 0 ? { headers } : {}) });
    // ack.t: a write on this socket is the cheapest possible basis notification — after its reply
    if (plan.op === "transact" && res.ok) {
      if (filtered && options.pollLog) {
        try {
          const log = await options.pollLog();
          try {
            await enqueueConsider(log, watermark);
          } catch {
            failSieve();
          }
        } catch {
          const t = (body as { t?: unknown } | null)?.t;
          if (typeof t === "number") notifyT(t);
        }
      } else {
        const t = (body as { t?: unknown } | null)?.t;
        if (typeof t === "number") notifyT(t);
      }
    }
  };

  socket.addEventListener("message", (ev: { data: string | ArrayBuffer }) => void onMessage(ev.data));
  socket.addEventListener("close", die);
  socket.addEventListener("error", die);

  if ((options.pollBasis || options.pollLog) && options.watchKey !== undefined) {
    const key = options.watchKey;
    const pollT = options.pollBasis;
    const pollLog = options.pollLog;
    const intervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const now = options.now ?? Date.now;

    let entry = readings.get(key);
    if (!entry) {
      entry = { t: 0, rootT: 0, entries: [], at: 0, pollingSince: 0, refs: 0 };
      readings.set(key, entry);
    }
    const shared = entry;
    shared.refs++;

    // the first value only seeds — a watcher reports movement, not the current
    // value; a warm reading seeds right away so the very next move ticks
    let seeded = shared.at > 0;
    if (seeded && shared.t > lastT) lastT = shared.t;
    if (seeded && shared.t > watermark) watermark = shared.t;
    const observeT = (t: number) => {
      if (!seeded) {
        seeded = true;
        if (t > lastT) lastT = t;
        if (t > watermark) watermark = t;
        return;
      }
      notifyT(t);
    };
    const observeLog = (log: SessionLog) => {
      if (!seeded) {
        seeded = true;
        if (log.t > lastT) lastT = log.t;
        if (log.t > watermark) watermark = log.t;
        return;
      }
      void enqueueConsider(log, watermark).catch(failSieve);
    };

    // this session's own poll is in flight; overlapping ticks are dropped rather than queued
    let inflight = false;
    const tick = async (): Promise<void> => {
      if (dead || inflight) return;
      const ts = now();
      if (shared.at > 0 && ts - shared.at < intervalMs) {
        if (filtered) observeLog({ t: shared.t, rootT: shared.rootT, entries: shared.entries });
        else observeT(shared.t);
        return;
      }
      if (shared.pollingSince > 0 && ts - shared.pollingSince < intervalMs) {
        // another session is polling this key; read what is already known
        if (shared.at > 0) {
          if (filtered) observeLog({ t: shared.t, rootT: shared.rootT, entries: shared.entries });
          else observeT(shared.t);
        }
        return;
      }
      inflight = true;
      shared.pollingSince = ts;
      try {
        if (pollLog) {
          const log = await pollLog();
          if (typeof log.t !== "number" || !Number.isFinite(log.t)) return;
          if (log.t >= shared.t) {
            shared.t = log.t;
            shared.rootT = log.rootT;
            shared.entries = log.entries.slice();
          }
          shared.at = now();
          if (filtered) observeLog({ t: shared.t, rootT: shared.rootT, entries: shared.entries });
          else observeT(shared.t);
        } else if (pollT) {
          const t = await pollT();
          if (typeof t !== "number" || !Number.isFinite(t)) return;
          if (t > shared.t) shared.t = t;
          shared.at = now();
          observeT(shared.t);
        }
      } catch {
        /* a transient replica error just means no news this tick */
      } finally {
        shared.pollingSince = 0;
        inflight = false;
      }
    };

    const cancel = (options.schedule ?? defaultSchedule)(() => void tick(), intervalMs);
    unsubscribe = () => {
      cancel();
      shared.refs--;
      if (shared.refs === 0 && readings.get(key) === shared) readings.delete(key);
    };
  }

  return {
    onMessage,
    notifyT,
    close() {
      const wasDead = dead;
      die();
      if (!wasDead) socket.close();
    },
    get lastT() {
      return lastT;
    },
    get watermark() {
      return watermark;
    },
    closed,
  };
}
