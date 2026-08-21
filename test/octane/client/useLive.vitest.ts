/**
 * The `useLive` contract. Session current-view reads run on the overlay;
 * pinned `asOf` still rides the peer. The stream form needs no db at all.
 *
 * Every case that has rows also asserts the DOM, not only the reported state:
 * a hook that updates its state but never re-renders would satisfy one and
 * not the other.
 */

import { render, waitFor } from "@octanejs/testing-library";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as Ramose from "ramose/db";
import type { Live } from "ramose/octane";
import { describe, expect, test } from "vitest";
import {
  LiveAsOf,
  LiveParams,
  LiveRows,
  LiveStream,
} from "../fixtures/reads.tsrx";
import {
  allTodos,
  type Answer,
  capture,
  fakePeer,
  ids,
  oneTodo,
  overlayPeer,
  sleep,
  Todo,
  todoWorld,
  Todos,
  txSnap,
  type World,
} from "../support/world.ts";

const rowsText = (container: HTMLElement): string | null =>
  container.querySelector(".rows")!.textContent;

const ticksAttr = (container: HTMLElement): string | null =>
  container.querySelector(".rows")!.getAttribute("data-ticks");

/** Pinned-view / peer-answer client: `asOf` still POSTs `q`. */
const pinned = () => {
  let respond: Answer = () => ({ body: { t: 1, result: [[1]] } });
  const peer = fakePeer({ answer: (frame) => respond(frame) });
  const client = Ramose.connect({
    url: "https://peer.example.com",
    fetch: peer.fetch,
    webSocket: peer.webSocket,
  });
  return {
    peer,
    db: client.db("todos", Todos),
    close: () => client.close(),
    answer: (next: Answer) => {
      respond = next;
    },
    qFrames: () => peer.frames.filter((frame) => frame.op === "q"),
  };
};

/** Session overlay client: the first `sync` dumps the world's datoms. */
const overlay = (world: World) => {
  const peer = overlayPeer(world);
  const client = Ramose.connect({
    url: "https://peer.example.com",
    fetch: peer.fetch,
    webSocket: peer.webSocket,
  });
  return { peer, db: client.db("todos", Todos), close: () => client.close() };
};

describe("useLive (query form)", () => {
  test("the first emission populates rows and the DOM; ticks stays 0", async () => {
    const world = await todoWorld(1);
    const { db, close } = overlay(world);
    const box = capture<Live<unknown, unknown>>();
    try {
      const { container } = render(LiveRows, {
        props: { db, query: allTodos, report: box.report },
      });
      expect(box.last()).toEqual({
        rows: undefined,
        error: undefined,
        ticks: 0,
      });
      expect(rowsText(container)).toBe("null");

      await waitFor(() =>
        expect(box.last().rows).toEqual(ids(...world.eids)),
      );
      expect(rowsText(container)).toBe(JSON.stringify(ids(...world.eids)));
      expect(box.last().ticks).toBe(0);
      expect(box.last().error).toBeUndefined();
    } finally {
      await close();
    }
  });

  test("a tx frame re-runs, updates the DOM, and increments ticks", async () => {
    const world = await todoWorld(1);
    const { db, peer, close } = overlay(world);
    const box = capture<Live<unknown, unknown>>();
    try {
      const { container } = render(LiveRows, {
        props: { db, query: allTodos, report: box.report },
      });
      await waitFor(() =>
        expect(box.last().rows).toEqual(ids(...world.eids)),
      );

      const two = txSnap(
        await world.conn.transact([{ ":db/id": "t1", ":todo/title": "t1" }]),
      );
      peer.push({ op: "tx", t: two.t, datoms: two.datoms });

      const expected = ids(world.eids[0]!, two.tempids.t1!);
      await waitFor(() =>
        expect(rowsText(container)).toBe(JSON.stringify(expected)),
      );
      expect(box.last().ticks).toBe(1);
      expect(ticksAttr(container)).toBe("1");
      expect(box.last().error).toBeUndefined();
    } finally {
      await close();
    }
  });

  test("changing the query resets state and re-subscribes", async () => {
    const world = await todoWorld(2);
    const { db, peer, close } = overlay(world);
    const box = capture<Live<unknown, unknown>>();
    try {
      const { rerender } = render(LiveRows, {
        props: { db, query: allTodos, report: box.report },
      });
      await waitFor(() =>
        expect(box.last().rows).toEqual(ids(...world.eids)),
      );

      const extra = txSnap(
        await world.conn.transact([{ ":db/id": "t2", ":todo/title": "t2" }]),
      );
      peer.push({ op: "tx", t: extra.t, datoms: extra.datoms });
      await waitFor(() => expect(box.last().ticks).toBe(1));

      rerender({ props: { db, query: oneTodo, report: box.report } });
      await waitFor(() =>
        expect(box.last().rows).toEqual(ids(world.eids[0]!)),
      );
      expect(box.last().ticks).toBe(0);
      expect(box.last().error).toBeUndefined();
    } finally {
      await close();
    }
  });

  test("a params-only change re-runs without blanking rows", async () => {
    const P = Ramose.params({ n: Schema.Number });
    const limited = Ramose.query(Todo, P).limit(P.n);

    const world = await todoWorld(2);
    const { db, close } = overlay(world);
    const box = capture<Live<unknown, unknown>>();
    try {
      const { rerender } = render(LiveParams, {
        props: { db, query: limited, n: 1, report: box.report },
      });
      await waitFor(() =>
        expect(box.last().rows).toEqual(ids(world.eids[0]!)),
      );

      rerender({ props: { db, query: limited, n: 2, report: box.report } });
      // no blank slate in between: every reported state from here on has rows
      const from = box.renders.length;
      await waitFor(() =>
        expect(box.last().rows).toEqual(ids(...world.eids)),
      );
      expect(
        box.renders.slice(from).every((live) => live.rows !== undefined),
      ).toBe(true);
      expect(box.last().error).toBeUndefined();
    } finally {
      await close();
    }
  });

  test("over db.asOf(t) the stream completes and the last rows stay", async () => {
    const { db, peer, answer, qFrames, close } = pinned();
    const box = capture<Live<unknown, unknown>>();
    try {
      answer(() => ({ body: { t: 5, result: [[3]] } }));
      render(LiveAsOf, { props: { db, query: allTodos, t: 5, report: box.report } });
      await waitFor(() => expect(box.last().rows).toEqual(ids(3)));
      expect(qFrames()[0]!.asOf).toBe(5);

      // the pinned stream has completed; a later tx is nobody's news
      await sleep();
      peer.push({ op: "tx", t: 9, datoms: [] });
      await sleep();
      expect(qFrames()).toHaveLength(1);
      expect(box.last().rows).toEqual(ids(3));
      expect(box.last().ticks).toBe(0);
      expect(box.last().error).toBeUndefined();
    } finally {
      await close();
    }
  });

  test("one subscription per view: equal inline asOf views never re-subscribe, a new t does", async () => {
    const { db, answer, qFrames, close } = pinned();
    const box = capture<Live<unknown, unknown>>();
    try {
      answer((frame) => ({
        body: { t: frame.asOf as number, result: [[frame.asOf as number]] },
      }));
      const props = (t: number) => ({ db, query: allTodos, t, report: box.report });

      const { rerender } = render(LiveAsOf, { props: props(5) });
      await waitFor(() => expect(box.last().rows).toEqual(ids(5)));

      rerender({ props: props(5) });
      rerender({ props: props(5) });
      await sleep();
      // still the one subscription: one live pass, one q frame
      expect(qFrames()).toHaveLength(1);
      expect(box.last().rows).toEqual(ids(5));
      expect(box.last().ticks).toBe(0);

      // a different coordinate is a different view: tear down, re-subscribe
      rerender({ props: props(6) });
      await waitFor(() => expect(box.last().rows).toEqual(ids(6)));
      expect(qFrames()).toHaveLength(2);
      expect(qFrames().at(-1)!.asOf).toBe(6);
      expect(box.last().ticks).toBe(0);
      expect(box.last().error).toBeUndefined();
    } finally {
      await close();
    }
  });

  test("a terminal Unauthorized sets error and keeps the last rows", async () => {
    const world = await todoWorld(1);
    let refuse = false;
    const peer = fakePeer({
      answer: (frame) =>
        frame.op === "sync"
          ? refuse
            ? { status: 401, body: { error: "token expired" } }
            : { body: { t: world.t, datoms: world.datoms } }
          : { body: { t: world.t, result: [] } },
    });
    const client = Ramose.connect({
      url: "https://peer.example.com",
      fetch: peer.fetch,
      webSocket: peer.webSocket,
    });
    const box = capture<Live<unknown, unknown>>();
    try {
      render(LiveRows, {
        props: { db: client.db("todos", Todos), query: allTodos, report: box.report },
      });
      await waitFor(() =>
        expect(box.last().rows).toEqual(ids(...world.eids)),
      );

      refuse = true;
      peer.drop();
      await waitFor(() => expect(box.last().error).toBeDefined());

      const failure = Cause.findErrorOption(box.last().error!);
      expect(Option.isSome(failure)).toBe(true);
      expect(Option.getOrThrow(failure)).toMatchObject({
        _tag: "Unauthorized",
      });
      expect(box.last().rows).toEqual(ids(...world.eids));
    } finally {
      await client.close();
    }
  });

  test("unmount interrupts — the peer sees no re-run on the next tick", async () => {
    const world = await todoWorld(1);
    const { db, peer, close } = overlay(world);
    const box = capture<Live<unknown, unknown>>();
    try {
      const { unmount } = render(LiveRows, {
        props: { db, query: allTodos, report: box.report },
      });
      await waitFor(() =>
        expect(box.last().rows).toEqual(ids(...world.eids)),
      );

      unmount();
      await sleep();
      const before = peer.frames.length;
      peer.push({ op: "tx", t: world.t + 1, datoms: [] });
      await sleep();
      expect(peer.frames.length).toBe(before);
    } finally {
      await close();
    }
  });
});

describe("useLive (stream form)", () => {
  test("drains any stream — no db, no provider", async () => {
    const box = capture<Live<unknown, unknown>>();
    const { container } = render(LiveStream, {
      props: { stream: Stream.make("a", "b", "c"), report: box.report },
    });
    await waitFor(() => expect(box.last().rows).toBe("c"));
    expect(rowsText(container)).toBe('"c"');
    // three emissions: two after the first
    expect(box.last().ticks).toBe(2);
    expect(box.last().error).toBeUndefined();
  });

  test("an interrupt cause is teardown, not news — error stays undefined", async () => {
    const box = capture<Live<unknown, unknown>>();
    render(LiveStream, {
      props: { stream: Stream.failCause(Cause.interrupt()), report: box.report },
    });
    await sleep();
    expect(box.last().error).toBeUndefined();
    expect(box.last().rows).toBeUndefined();
  });

  test("re-subscribes when the stream identity changes", async () => {
    const box = capture<Live<unknown, unknown>>();
    const { rerender } = render(LiveStream, {
      props: { stream: Stream.make(1), report: box.report },
    });
    await waitFor(() => expect(box.last().rows).toBe(1));

    rerender({ props: { stream: Stream.make(2), report: box.report } });
    await waitFor(() => expect(box.last().rows).toBe(2));
    expect(box.last().ticks).toBe(0);
  });
});
