/**
 * `useQuery` — the one-shot read as `Async`:
 *
 * - one `q` per view; a fresh-but-equal inline `db.asOf(t)` is not a re-run
 *   (and, transitively, not a render loop);
 * - a `t` change re-runs; the in-flight state is `loading: true` over the
 *   previous `data` (no flash to `undefined` on scrub);
 * - a slower answer to an older run is dropped — last-write-wins by issue
 *   order, not by resolution order;
 * - a terminal failure lands as the `Cause`, with the last `data` kept.
 */

import { render, waitFor } from "@octanejs/testing-library";
import * as Cause from "effect/Cause";
import * as Ramose from "ramose/db";
import type { Async } from "ramose/octane";
import { describe, expect, test } from "vitest";
import { QueryRows } from "../fixtures/reads.tsrx";
import { capture, fakePeer, type FakePeer, sleep, Todos } from "../support/world.ts";

/** Rows for one title, in the wire shape a select query comes back as. */
const rowsFor = (title: string) => [[{ title }]];

/** A peer whose `q` answers depend on the frame's `asOf` coordinate. */
const scrubPeer = (
  byAsOf: Record<number, { title: string; delay?: number; status?: number }>,
): FakePeer =>
  fakePeer({
    answer: (frame) => {
      if (frame.op !== "q") return { body: { t: 1, result: [] } };
      const spec = byAsOf[frame.asOf as number];
      if (spec === undefined) return { body: { t: 1, result: [] } };
      if (spec.status !== undefined) {
        return { status: spec.status, body: { error: spec.title } };
      }
      return {
        body: { t: frame.asOf, result: rowsFor(spec.title) },
        delay: spec.delay,
      };
    },
  });

const dbOver = (peer: FakePeer) =>
  Ramose.connect({
    url: "https://peer.example.com",
    fetch: peer.fetch,
    webSocket: peer.webSocket,
  }).db("todos", Todos);

describe("useQuery", () => {
  test("one q per view: rows land, and equal inline views never re-run", async () => {
    const peer = scrubPeer({ 1: { title: "one" } });
    const box = capture<Async<unknown, unknown>>();
    const props = { db: dbOver(peer), t: 1, report: box.report };

    const { container, rerender } = render(QueryRows, { props });
    expect(box.last()).toEqual({
      data: undefined,
      error: undefined,
      loading: true,
    });
    expect(container.querySelector(".data")!.getAttribute("data-loading")).toBe(
      "true",
    );

    await waitFor(() => expect(box.last().loading).toBe(false));
    expect(box.last().data).toEqual([{ title: "one" }]);
    expect(container.querySelector(".data")!.textContent).toBe(
      JSON.stringify([{ title: "one" }]),
    );

    rerender({ props });
    rerender({ props });
    await sleep();
    expect(peer.frameOps("q")).toHaveLength(1);
  });

  test("a scrub keeps the previous data while loading, and drops the stale slower answer", async () => {
    const peer = scrubPeer({
      1: { title: "one", delay: 80 },
      2: { title: "two" },
      3: { title: "three" },
    });
    const db = dbOver(peer);
    const box = capture<Async<unknown, unknown>>();
    const props = (t: number) => ({ db, t, report: box.report });

    const { rerender } = render(QueryRows, { props: props(2) });
    await waitFor(() => expect(box.last().data).toEqual([{ title: "two" }]));

    // scrub to the slow coordinate: in flight over the old rows, no flash
    rerender({ props: props(1) });
    expect(box.last().loading).toBe(true);
    expect(box.last().data).toEqual([{ title: "two" }]);

    // scrub again before it answers; the newer run wins
    rerender({ props: props(3) });
    await waitFor(() => expect(box.last().data).toEqual([{ title: "three" }]));
    expect(box.last().loading).toBe(false);

    // ...and stays won when the slower answer finally arrives
    await sleep(120);
    expect(box.last().data).toEqual([{ title: "three" }]);
    expect(box.last().error).toBeUndefined();
    expect(peer.frameOps("q").map((frame) => frame.asOf)).toEqual([2, 1, 3]);
  });

  test("a terminal failure lands as the Cause, over the last data", async () => {
    const peer = scrubPeer({
      2: { title: "two" },
      4: { title: "bad basis", status: 400 },
    });
    const db = dbOver(peer);
    const box = capture<Async<unknown, unknown>>();
    const props = (t: number) => ({ db, t, report: box.report });

    const { rerender } = render(QueryRows, { props: props(2) });
    await waitFor(() => expect(box.last().data).toEqual([{ title: "two" }]));

    rerender({ props: props(4) });
    await waitFor(() => expect(box.last().error).toBeDefined());
    expect(box.last().loading).toBe(false);
    expect(box.last().data).toEqual([{ title: "two" }]);
    expect(Cause.squash(box.last().error!)).toMatchObject({
      _tag: "InvalidRequest",
    });

    // a new run clears the error
    rerender({ props: props(2) });
    await waitFor(() => expect(box.last().error).toBeUndefined());
    expect(box.last().data).toEqual([{ title: "two" }]);
  });
});
