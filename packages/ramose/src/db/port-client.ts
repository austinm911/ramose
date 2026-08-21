/**
 * Tab-side overlay / session stand-in over a {@link PortLike}. The tab
 * never holds a Connection. History / asOf stay HTTPS on the tab.
 */

import * as Effect from "effect/Effect";
import type { DbError } from "./Errors.ts";
import { NetworkError } from "./Errors.ts";
import type { Overlay, OverlayAck } from "./overlay.ts";
import {
  type PortEvent,
  type PortLike,
  asPortEvent,
  decodeError,
} from "./port.ts";
import type { Session, SessionPrincipal } from "./session.ts";

export interface PortClient {
  readonly overlay: Overlay;
  readonly session: Session;
  open(args: {
    readonly name: string;
    readonly url: string;
    readonly schema?: readonly unknown[];
    readonly token?: string;
  }): Promise<void>;
  auth(token: string): Promise<void>;
  close(): void;
}

/**
 * SharedWorker bind: transfer a dedicated {@link MessagePort} so one tab
 * can follow many dbs without mixing frames. Reply lands on the child port.
 */
export const connectSharedFollower = (
  workerPort: PortLike,
  args: {
    readonly name: string;
    readonly url: string;
    readonly schema?: readonly unknown[];
    readonly token?: string;
  },
  opts?: { readonly timeoutMs?: number },
): Promise<PortClient> => {
  const timeoutMs = opts?.timeoutMs ?? 4_000;
  const channel = new MessageChannel();
  const client = openPortClient(channel.port2);
  return new Promise<PortClient>((resolve, reject) => {
    const id = 1;
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      channel.port2.removeEventListener?.("message", onMsg);
      fn();
    };
    const fail = (cause: unknown): void =>
      finish(() =>
        reject(
          cause instanceof NetworkError
            ? cause
            : new NetworkError({
                message: cause instanceof Error ? cause.message : String(cause),
                cause,
              }),
        ),
      );
    const timer = setTimeout(() => {
      fail(new NetworkError({ message: "ramose: follower worker did not answer" }));
    }, timeoutMs);
    const onMsg = (ev: MessageEvent) => {
      const frame = asPortEvent(ev.data);
      if (frame === undefined || frame.op !== "reply" || frame.id !== id) return;
      if (frame.ok) finish(() => resolve(client));
      else fail(decodeError(frame.error));
    };
    channel.port2.addEventListener("message", onMsg);
    channel.port2.addEventListener?.("messageerror", () => {
      fail(new NetworkError({ message: "ramose: follower worker failed" }));
    });
    channel.port2.start?.();
    channel.port1.start?.();
    try {
      (
        workerPort as PortLike & {
          postMessage(data: unknown, transfer: Transferable[]): void;
        }
      ).postMessage(
        {
          id,
          op: "open",
          name: args.name,
          url: args.url,
          ...(args.schema !== undefined ? { schema: args.schema } : {}),
          ...(args.token !== undefined ? { token: args.token } : {}),
        },
        [channel.port1],
      );
    } catch (cause) {
      fail(cause);
    }
  });
};

export const openPortClient = (port: PortLike): PortClient => {
  port.start?.();
  let nextId = 1;
  let epoch = 0;
  let confirmedT = 0;
  let generation = 1;
  let closed = false;
  let basisT = 0;
  const pending = new Map<
    number,
    { resolve: (body: unknown) => void; reject: (err: DbError) => void }
  >();
  const listeners = new Set<() => void>();
  const wakers = new Set<() => void>();
  const rowSubs = new Map<string, (rows: unknown) => void>();

  const wake = (): void => {
    for (const cb of [...wakers]) cb();
  };

  const notify = (): void => {
    for (const cb of [...listeners]) cb();
    wake();
  };

  const onEvent = (ev: MessageEvent): void => {
    const frame = asPortEvent(ev.data);
    if (frame === undefined) return;
    if (frame.op === "reply") {
      const p = pending.get(frame.id);
      if (p === undefined) return;
      pending.delete(frame.id);
      if (frame.ok) p.resolve(frame.body);
      else p.reject(decodeError(frame.error));
      return;
    }
    if (frame.op === "change") {
      epoch = frame.epoch;
      notify();
      return;
    }
    if (frame.op === "rows") {
      epoch = frame.epoch;
      rowSubs.get(frame.subId)?.(frame.rows);
      notify();
    }
  };

  port.addEventListener("message", onEvent);

  const rpc = <A>(
    rest: { readonly op: string } & Record<string, unknown>,
  ): Effect.Effect<A, DbError> =>
    Effect.tryPromise({
      try: () => {
        if (closed) {
          return Promise.reject(
            new NetworkError({ message: "ramose: the client is closed" }),
          );
        }
        const id = nextId++;
        return new Promise<A>((resolve, reject) => {
          pending.set(id, {
            resolve: (body) => resolve(body as A),
            reject,
          });
          try {
            port.postMessage({ id, ...rest });
          } catch (cause) {
            pending.delete(id);
            reject(
              new NetworkError({
                message: cause instanceof Error ? cause.message : String(cause),
                cause,
              }),
            );
          }
        });
      },
      catch: (cause) =>
        cause instanceof NetworkError
          ? cause
          : new NetworkError({
              message: cause instanceof Error ? cause.message : String(cause),
              cause,
            }),
    });

  const overlay: Overlay = {
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
    ready: (retry = true) =>
      rpc<{ confirmedT: number; epoch: number }>({ op: "ready" }).pipe(
        Effect.tap((body) =>
          Effect.sync(() => {
            void retry;
            if (typeof body.confirmedT === "number") confirmedT = body.confirmedT;
            if (typeof body.epoch === "number") epoch = body.epoch;
          }),
        ),
        Effect.asVoid,
      ),
    read: (op, body) => rpc(op === "q" ? { op: "q", body } : { op: "pull", body }),
    transact: (tx) =>
      rpc<OverlayAck>({ op: "transact", tx }).pipe(
        Effect.tap((ack) =>
          Effect.sync(() => {
            if (typeof ack.t === "number" && ack.t > confirmedT) {
              confirmedT = ack.t;
              basisT = Math.max(basisT, ack.t);
            }
          }),
        ),
      ),
    handlePush: async () => {
      // inbound frames land on the follower, not the tab
    },
    snapshot: () =>
      Promise.reject(new Error("ramose: snapshot is owned by the follower")),
    flush: () =>
      Effect.runPromise(rpc({ op: "flush" })).then(() => undefined),
  };

  const session: Session = {
    request: async () => {
      throw new Error("ramose: session frames are owned by the follower");
    },
    get t() {
      return basisT;
    },
    get epoch() {
      return epoch;
    },
    get generation() {
      return generation;
    },
    get principal(): SessionPrincipal | undefined {
      return undefined;
    },
    get connects() {
      return 1;
    },
    get closed() {
      return closed;
    },
    bump: (t) => {
      if (t > basisT) basisT = t;
      wake();
    },
    nudge: () => {
      epoch += 1;
      wake();
    },
    onWake: (cb) => {
      wakers.add(cb);
      return () => {
        wakers.delete(cb);
      };
    },
    onPush: () => () => {},
    close: () => {
      closed = true;
      generation += 1;
      wake();
      try {
        port.postMessage({ id: nextId++, op: "close" });
      } catch {
        /* already gone */
      }
      port.close?.();
    },
  };

  return {
    overlay,
    session,
    open: async (args) => {
      await Effect.runPromise(
        rpc({
          op: "open",
          name: args.name,
          url: args.url,
          ...(args.schema !== undefined ? { schema: args.schema } : {}),
          ...(args.token !== undefined ? { token: args.token } : {}),
        }),
      );
    },
    auth: async (token) => {
      await Effect.runPromise(rpc({ op: "auth", token }));
    },
    close: () => {
      session.close();
    },
  };
};
