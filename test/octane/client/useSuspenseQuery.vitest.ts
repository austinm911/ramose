/**
 * `useSuspenseQuery` — wait for a first local answer, never for connectivity:
 *
 * - suspends under Suspense while pending and the session could still produce
 *   an answer;
 * - does not suspend over a stale local answer under an unreachable session;
 * - reports `pending` (empty offline) when the session cannot produce one;
 * - returns `{ status: "error" }` rather than throwing;
 * - holds the suspended observation outside the discarded component and
 *   releases it once an answer settles the wait.
 */

import { act, render } from "@octanejs/testing-library";
import type { QueryState } from "ramose/octane";
import { describe, expect, test } from "vitest";
import { SuspenseQuery } from "../fixtures/reads.tsrx";
import {
  capture,
  suspendedQueryCount,
  titles,
  todoWorld,
} from "../support/world.ts";

const rows = [{ title: "milk" }] as const;

describe("useSuspenseQuery", () => {
  test("suspends while pending under a session that could still answer", async () => {
    const world = todoWorld("live");
    const box = capture<QueryState<unknown>>();

    const { container } = render(SuspenseQuery, {
      props: { client: world.client, query: titles, report: box.report },
    });

    expect(container.querySelector(".fallback")).not.toBeNull();
    expect(container.querySelector(".suspense")).toBeNull();
    expect(suspendedQueryCount(world.db)).toBe(1);
    expect(box.renders).toHaveLength(0);

    await act(() => {
      world.answer(titles, rows);
    });

    expect(container.querySelector(".fallback")).toBeNull();
    expect(box.last()).toEqual({ status: "ready", data: rows });
    expect(container.querySelector(".suspense")!.textContent).toBe(
      JSON.stringify(rows),
    );
    expect(suspendedQueryCount(world.db)).toBe(0);
  });

  test("does not suspend over a stale answer under an unreachable session", () => {
    const world = todoWorld("live");
    const box = capture<QueryState<unknown>>();
    const data = [{ title: "milk" }];

    world.answerStale(titles, data);
    world.sync("offline");

    const { container } = render(SuspenseQuery, {
      props: { client: world.client, query: titles, report: box.report },
    });

    expect(container.querySelector(".fallback")).toBeNull();
    const stale = box.last();
    expect(stale).toEqual({ status: "stale", data });
    if (stale.status !== "stale") throw new Error("expected stale");
    expect(stale.data).toBe(data);
    expect(suspendedQueryCount(world.db)).toBe(0);
  });

  test("reports pending when the session cannot produce an answer", () => {
    const world = todoWorld("offline");
    const box = capture<QueryState<unknown>>();

    const { container } = render(SuspenseQuery, {
      props: { client: world.client, query: titles, report: box.report },
    });

    expect(container.querySelector(".fallback")).toBeNull();
    expect(box.last()).toEqual({ status: "pending" });
    expect(container.querySelector(".suspense")!.textContent).toBe(
      "empty-offline",
    );
    expect(suspendedQueryCount(world.db)).toBe(0);
  });

  test("returns error state rather than throwing", () => {
    const world = todoWorld();
    const box = capture<QueryState<unknown>>();
    const failure = new Error("cannot answer");

    world.failQuery(titles, failure);

    const { container } = render(SuspenseQuery, {
      props: { client: world.client, query: titles, report: box.report },
    });

    expect(container.querySelector(".fallback")).toBeNull();
    const failed = box.last();
    expect(failed).toEqual({ status: "error", error: failure });
    if (failed.status !== "error") throw new Error("expected error");
    expect(failed.error).toBe(failure);
  });
});
