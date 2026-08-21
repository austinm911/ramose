/**
 * The world every test file here shares: the todo catalog, the two client
 * shapes the hooks are exercised against, and the capture box a `.tsrx`
 * fixture reports its render values through.
 *
 * The fake peer and the overlay seed are imported, not copied: both are pure
 * TypeScript with no renderer in them, so the react suite's doubles are the
 * doubles here too. That is deliberate — one protocol fake, one definition of
 * "the peer answered", so the two bindings are held to the same story.
 */

import * as Schema from "effect/Schema";
import * as Ramose from "ramose/db";
import {
  catalogWorld,
  snapshotOf,
  txSnap,
} from "../../../packages/ramose/test/overlay-seed.ts";
import type { Connection } from "../../../packages/ramose/src/internal/core/conn.ts";
import {
  type Answer,
  type Call,
  fakePeer,
  type FakePeer,
  type Frame,
} from "../../../packages/ramose/test/react/peer.ts";

export { fakePeer, txSnap };
export type { Answer, Call, FakePeer, Frame };

export const Todo = Ramose.Namespace("todo", {
  title: Ramose.Attr(Schema.String),
  slug: Ramose.Attr(Schema.String, { unique: "identity" }),
});
export const Todos = Ramose.Catalog({ todo: Todo });

/** Hoisted, as every consumer must hoist them: `query` is an identity dep. */
export const titles = Ramose.query(Todo).select({ title: Todo.title });
export const allTodos = Ramose.query(Todo);
export const oneTodo = Ramose.query(Todo).limit(1);
export const shape = { title: Todo.title };

/** Every pass is a handful of microtasks; a beat is plenty. */
export const sleep = (ms = 25): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
};

/** Entity ids in the shape rows carry them — `Eid` is `{ id }`, as data. */
export const ids = (...ns: number[]): readonly Ramose.Eid[] =>
  ns.map((id) => ({ id }));

export interface World {
  readonly conn: Connection;
  /** Entity ids of the seeded todos, in creation order. */
  readonly eids: number[];
  readonly t: number;
  readonly datoms: unknown[];
}

/** A local world with `n` todos, snapshotted for a session's first `sync`. */
export const todoWorld = async (n: number): Promise<World> => {
  const conn = await catalogWorld(Todos);
  const eids: number[] = [];
  for (let i = 0; i < n; i++) {
    const rep = await conn.transact([
      { ":db/id": `t${i}`, ":todo/title": `t${i}`, ":todo/slug": `s${i}` },
    ]);
    eids.push(rep.tempids[`t${i}`]!);
  }
  const snapshot = await snapshotOf(conn);
  return { conn, eids, ...snapshot };
};

/**
 * A peer whose first `sync` dumps the world, so current-view reads answer
 * from the session overlay and `{ op: "tx" }` frames move the basis.
 */
export const overlayPeer = (world: {
  readonly t: number;
  readonly datoms: unknown[];
}): FakePeer =>
  fakePeer({
    answer: (frame) =>
      frame.op === "sync"
        ? { body: { t: world.t, datoms: world.datoms } }
        : { body: { t: world.t, result: [] } },
    http: () => ({ body: { t: world.t, txEid: 1, tempids: {}, datoms: 1 } }),
  });

/** `ClientOptions` over a fake peer, as provider props. */
export const providerProps = (
  peer: FakePeer,
  url = "https://peer.example.com",
): { url: string; fetch: typeof fetch; webSocket: typeof WebSocket } => ({
  url,
  fetch: peer.fetch,
  webSocket: peer.webSocket,
});

/**
 * What a fixture reports out of its render, so a test can assert on the value
 * itself — a `Cause`, an object identity, a `Transact` — and not only on the
 * text it serialised into the DOM.
 */
export interface Capture<T> {
  /** Every value reported, oldest first: how many renders, and what each saw. */
  readonly renders: T[];
  /** Hand this to a fixture's `report` prop. */
  readonly report: (value: T) => void;
  /** The latest value reported. */
  last(): T;
}

export const capture = <T>(): Capture<T> => {
  const renders: T[] = [];
  return {
    renders,
    report: (value) => {
      renders.push(value);
    },
    last: () => renders[renders.length - 1]!,
  };
};
