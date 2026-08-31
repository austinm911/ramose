/**
 * `useQuery` — one query observed as component state:
 *
 * - `pending` until a local answer arrives, then `ready` / `stale` / `error`;
 * - a reconnect that flips staleness keeps `data` identity;
 * - two readers asking the same question share one observation;
 * - rebuilding an equal query every render selects that same observation;
 * - an explicit `database` works with no provider in the tree;
 * - the last unmount releases the observation.
 */

import { act, render } from "@octanejs/testing-library";
import type { QueryState } from "ramose/octane";
import { describe, expect, test } from "vitest";
import {
  QueryDirect,
  QueryInline,
  QueryRows,
  TwoQueryReaders,
} from "../fixtures/reads.tsrx";
import {
  capture,
  heldStoreCount,
  titles,
  todoWorld,
} from "../support/world.ts";

const rows = [{ title: "milk" }] as const;

describe("useQuery", () => {
  test("reports pending, then ready once an answer is published", async () => {
    const world = todoWorld();
    const box = capture<QueryState<unknown>>();

    const { container } = render(QueryRows, {
      props: { client: world.client, query: titles, report: box.report },
    });

    expect(box.last()).toEqual({ status: "pending" });
    expect(container.querySelector(".query")!.getAttribute("data-status")).toBe(
      "pending",
    );

    await act(() => {
      world.answer(titles, rows);
    });

    expect(box.last()).toEqual({ status: "ready", data: rows });
    expect(container.querySelector(".query")!.textContent).toBe(
      JSON.stringify(rows),
    );
  });

  test("answerStale with the same data reference keeps data identity", async () => {
    const world = todoWorld();
    const box = capture<QueryState<unknown>>();
    const data = [{ title: "milk" }];

    render(QueryRows, {
      props: { client: world.client, query: titles, report: box.report },
    });

    await act(() => {
      world.answer(titles, data);
    });
    const ready = box.last();
    expect(ready).toEqual({ status: "ready", data });

    await act(() => {
      world.answerStale(titles, data);
    });
    const stale = box.last();
    expect(stale.status).toBe("stale");
    if (stale.status !== "stale" || ready.status !== "ready") {
      throw new Error("expected ready then stale");
    }
    expect(stale.data).toBe(ready.data);
    expect(stale.data).toBe(data);
  });

  test("failQuery yields error carrying that exact Error", async () => {
    const world = todoWorld();
    const box = capture<QueryState<unknown>>();
    const failure = new Error("cannot answer");

    render(QueryRows, {
      props: { client: world.client, query: titles, report: box.report },
    });

    await act(() => {
      world.failQuery(titles, failure);
    });

    const failed = box.last();
    expect(failed).toEqual({ status: "error", error: failure });
    if (failed.status !== "error") throw new Error("expected error");
    expect(failed.error).toBe(failure);
  });

  test("resetQuery returns the reader to pending", async () => {
    const world = todoWorld();
    const box = capture<QueryState<unknown>>();

    render(QueryRows, {
      props: { client: world.client, query: titles, report: box.report },
    });

    await act(() => {
      world.answer(titles, rows);
    });
    expect(box.last().status).toBe("ready");

    await act(() => {
      world.resetQuery(titles);
    });
    expect(box.last()).toEqual({ status: "pending" });
  });

  test("two readers asking the same question share one observation", () => {
    const world = todoWorld();
    const a = capture<QueryState<unknown>>();
    const b = capture<QueryState<unknown>>();

    render(TwoQueryReaders, {
      props: {
        client: world.client,
        query: titles,
        reportA: a.report,
        reportB: b.report,
      },
    });

    expect(a.last().status).toBe("pending");
    expect(b.last().status).toBe("pending");
    expect(heldStoreCount(world.db)).toBe(1);
    expect(world.observers(titles)).toBe(2);
  });

  test("rebuilding an equal query inline still selects one observation", async () => {
    const world = todoWorld();
    const box = capture<QueryState<unknown>>();

    const { rerender } = render(QueryInline, {
      props: { client: world.client, report: box.report },
    });

    expect(world.observers(titles)).toBe(1);
    expect(heldStoreCount(world.db)).toBe(1);

    rerender({ props: { client: world.client, report: box.report } });
    rerender({ props: { client: world.client, report: box.report } });

    expect(world.observers(titles)).toBe(1);
    expect(heldStoreCount(world.db)).toBe(1);

    await act(() => {
      world.answer(titles, rows);
    });
    expect(box.last()).toEqual({ status: "ready", data: rows });
  });

  test("an explicit database works with no provider in the tree", async () => {
    const world = todoWorld();
    const box = capture<QueryState<unknown>>();

    const { container } = render(QueryDirect, {
      props: {
        database: world.db,
        query: titles,
        report: box.report,
      },
    });

    expect(box.last()).toEqual({ status: "pending" });

    await act(() => {
      world.answer(titles, rows);
    });

    expect(box.last()).toEqual({ status: "ready", data: rows });
    expect(container.querySelector(".query")!.getAttribute("data-status")).toBe(
      "ready",
    );
  });

  test("unmounting the last reader releases the observation", () => {
    const world = todoWorld();
    const box = capture<QueryState<unknown>>();

    const { unmount } = render(QueryRows, {
      props: { client: world.client, query: titles, report: box.report },
    });

    expect(world.observers(titles)).toBe(1);
    expect(heldStoreCount(world.db)).toBe(1);

    unmount();

    expect(world.observers(titles)).toBe(0);
    expect(heldStoreCount(world.db)).toBe(0);
  });
});
