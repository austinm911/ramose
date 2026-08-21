/**
 * `usePull` — a standing `db.livePull` as `Live`.
 *
 * Session current-view pulls run on the overlay. Pinned `asOf` still rides
 * the peer. Subject identity is structural.
 */

import { render, waitFor } from "@octanejs/testing-library";
import * as Cause from "effect/Cause";
import * as Ramose from "ramose/db";
import type { Live } from "ramose/octane";
import { describe, expect, test } from "vitest";
import { PullAsOf, PullRow } from "../fixtures/reads.tsrx";
import {
  capture,
  fakePeer,
  type FakePeer,
  overlayPeer,
  sleep,
  Todos,
  todoWorld,
  txSnap,
} from "../support/world.ts";

const pullText = (container: HTMLElement) =>
  container.querySelector(".pull")!.textContent;

const dbOver = (peer: FakePeer) =>
  Ramose.connect({
    url: "https://peer.example.com",
    fetch: peer.fetch,
    webSocket: peer.webSocket,
  }).db("todos", Todos);

describe("usePull", () => {
  test("first emission, a tx re-emission, and a retract's null", async () => {
    const world = await todoWorld(2);
    const peer = overlayPeer(world);
    const box = capture<Live<unknown, unknown>>();

    const { container } = render(PullRow, {
      props: { db: dbOver(peer), id: world.eids[0]!, report: box.report },
    });
    await waitFor(() => expect(box.last().rows).toEqual({ title: "t0" }));
    expect(pullText(container)).toBe(JSON.stringify({ title: "t0" }));
    expect(box.last().ticks).toBe(0);

    const renamed = txSnap(
      await world.conn.transact([
        { ":db/id": world.eids[0]!, ":todo/title": "renamed" },
      ]),
    );
    peer.push({ op: "tx", t: renamed.t, datoms: renamed.datoms });
    await waitFor(() => expect(box.last().rows).toEqual({ title: "renamed" }));
    expect(box.last().ticks).toBe(1);

    const gone = txSnap(
      await world.conn.transact([[":db/retractEntity", world.eids[0]!]]),
    );
    peer.push({ op: "tx", t: gone.t, datoms: gone.datoms });
    await waitFor(() => expect(box.last().rows).toBeNull());
    expect(pullText(container)).toBe("null");
    expect(box.last().ticks).toBe(2);
    expect(box.last().error).toBeUndefined();
  });

  test("the subject is structural: equal literals hold one subscription, a new subject re-subscribes", async () => {
    const world = await todoWorld(2);
    const peer = overlayPeer(world);
    const db = dbOver(peer);
    const box = capture<Live<unknown, unknown>>();
    const props = (id: number) => ({ db, id, report: box.report });

    const { rerender } = render(PullRow, { props: props(world.eids[0]!) });
    await waitFor(() => expect(box.last().rows).toEqual({ title: "t0" }));

    rerender({ props: props(world.eids[0]!) });
    rerender({ props: props(world.eids[0]!) });
    await sleep();
    expect(box.last().rows).toEqual({ title: "t0" });
    // the overlay answered every one of these: nothing went to the peer
    expect(peer.frameOps("pull")).toHaveLength(0);

    rerender({ props: props(world.eids[1]!) });
    await waitFor(() => expect(box.last().rows).toEqual({ title: "t1" }));
    expect(peer.frameOps("pull")).toHaveLength(0);
  });

  test("a pinned view emits once, completes, and keeps its rows", async () => {
    const peer = fakePeer({
      answer: (frame) =>
        frame.op === "pull"
          ? { body: { t: 5, result: { title: "then" } } }
          : { body: { t: 5, result: [] } },
    });
    const box = capture<Live<unknown, unknown>>();
    const props = { db: dbOver(peer), t: 3, id: 17, report: box.report };

    const { rerender } = render(PullAsOf, { props });
    await waitFor(() => expect(box.last().rows).toEqual({ title: "then" }));

    rerender({ props });
    peer.push({ op: "tx", t: 99, datoms: [] });
    await sleep();
    expect(box.last().rows).toEqual({ title: "then" });
    expect(box.last().error).toBeUndefined();
    expect(peer.frameOps("pull")).toHaveLength(1);
    expect(peer.frameOps("pull")[0]!.asOf).toBe(3);
  });

  test("a terminal refusal lands in error, over the last rows", async () => {
    const world = await todoWorld(2);
    let refuse = false;
    const peer = fakePeer({
      answer: (frame) =>
        frame.op === "sync"
          ? refuse
            ? { status: 401, body: { error: "no" } }
            : { body: { t: world.t, datoms: world.datoms } }
          : { body: { t: world.t, result: null } },
    });
    const box = capture<Live<unknown, unknown>>();

    render(PullRow, {
      props: { db: dbOver(peer), id: world.eids[0]!, report: box.report },
    });
    await waitFor(() => expect(box.last().rows).toEqual({ title: "t0" }));

    refuse = true;
    peer.drop();
    await waitFor(() => expect(box.last().error).toBeDefined());
    expect(box.last().rows).toEqual({ title: "t0" });
    expect(Cause.squash(box.last().error!)).toMatchObject({
      _tag: "Unauthorized",
    });
  });
});
