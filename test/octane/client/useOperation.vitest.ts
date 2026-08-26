/**
 * The useOperation contract:
 *
 * - a successful `run` resolves `{ ok: true, value }`, and `pending` flips
 *   true → false around it;
 * - a failing `run` resolves `{ ok: false, error }`, calls `onError` with
 *   the tagged error, and lands the same value on `error`;
 * - `error` clears on the next successful run, and on `clearError`;
 * - pending / error are per invocation key — two entities spinner
 *   independently;
 * - concurrent runs settle independently: the last settler wins `error`;
 * - an unmounted component touches no state when a late run settles, but
 *   `onError` still fires (the toast host outlives the form).
 *
 * Octane's `act` is always async (`act<T>(fn): Promise<T>`), so every
 * boundary here is awaited — unlike React's dual sync/async form.
 */

import { act, render } from "@octanejs/testing-library";
import type { Db, Operation, OpReport } from "ramose/db";
import { Unauthorized } from "ramose/db";
import type { OperationHandle, RunResult } from "ramose/octane";
import { describe, expect, test } from "vitest";
import { OperationHost } from "../fixtures/operations.tsrx";
import { capture, Todo } from "../support/world.ts";

type Handle = OperationHandle<
  (a: unknown, b?: unknown) => Promise<RunResult<OpReport<unknown>>>
>;

const pendingAttr = (container: HTMLElement) =>
  container.querySelector(".operation")!.getAttribute("data-pending");

const report = (output: unknown = {}): OpReport<unknown> =>
  ({
    t: 1,
    txEid: 1,
    datomCount: 0,
    output,
    dbAfter: {},
  }) as OpReport<unknown>;

const fakeDb = (
  run: (operation: unknown, a: unknown, b?: unknown) => Promise<OpReport<unknown>>,
): Db => ({ run } as unknown as Db);

const bareOp = {
  _tag: "Operation",
  name: "todo/add",
  on: undefined,
} as unknown as Operation<string, { title: string }, { id: number }, undefined>;

const onOp = {
  _tag: "Operation",
  name: "todo/set-done",
  on: Todo,
} as unknown as Operation<
  string,
  { done: boolean },
  Record<string, never>,
  typeof Todo
>;

describe("useOperation", () => {
  test("success resolves { ok, value } and pending flips true → false", async () => {
    const g = Promise.withResolvers<OpReport<unknown>>();
    const box = capture<Handle>();
    const { container } = render(OperationHost, {
      props: { db: fakeDb(() => g.promise), operation: bareOp, report: box.report },
    });
    expect(box.last().pending).toBe(false);

    let outcome!: Promise<RunResult<OpReport<unknown>>>;
    await act(() => {
      outcome = box.last().run({ title: "x" });
    });
    expect(box.last().pending).toBe(true);
    expect(pendingAttr(container)).toBe("true");

    const value = report({ id: 42 });
    g.resolve(value);
    const settled = await act(() => outcome);
    expect(settled).toEqual({ ok: true, value });
    expect(box.last().pending).toBe(false);
    expect(pendingAttr(container)).toBe("false");
    expect(box.last().error).toBeUndefined();
  });

  test("pendingFor is per entity so two buttons spinner independently", async () => {
    const waits = new Map<number, PromiseWithResolvers<OpReport<unknown>>>();
    const db = fakeDb((_op, entity) => {
      const g = Promise.withResolvers<OpReport<unknown>>();
      waits.set(entity as number, g);
      return g.promise;
    });
    const box = capture<Handle>();
    render(OperationHost, { props: { db, operation: onOp, report: box.report } });

    let ranA!: Promise<RunResult<OpReport<unknown>>>;
    let ranB!: Promise<RunResult<OpReport<unknown>>>;
    await act(() => {
      ranA = box.last().run(1, { done: true });
      ranB = box.last().run(2, { done: false });
    });
    expect(box.last().pending).toBe(true);
    expect(box.last().pendingFor(1)).toBe(true);
    expect(box.last().pendingFor(2)).toBe(true);
    expect(box.last().pendingFor(3)).toBe(false);

    waits.get(1)!.resolve(report());
    await act(() => ranA);
    expect(box.last().pendingFor(1)).toBe(false);
    expect(box.last().pendingFor(2)).toBe(true);
    expect(box.last().pending).toBe(true);

    waits.get(2)!.resolve(report());
    await act(() => ranB);
    expect(box.last().pending).toBe(false);
    expect(box.last().pendingFor(2)).toBe(false);
  });

  test("failure calls onError with the Unauthorized instance and sets error", async () => {
    const denied = new Unauthorized({
      message: "remove denied on :issue/status",
      code: "policy",
      attr: ":issue/status",
    });
    const seen: unknown[] = [];
    const box = capture<Handle>();
    const { container } = render(OperationHost, {
      props: {
        db: fakeDb(() => Promise.reject(denied)),
        operation: onOp,
        onError: (e: unknown) => seen.push(e),
        report: box.report,
      },
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await box.last().run(7, { done: true });
    });

    expect(outcome).toEqual({ ok: false, error: denied });
    expect(seen).toEqual([denied]);
    expect(box.last().error).toBe(denied);
    expect(box.last().errorFor(7)).toBe(denied);
    expect(box.last().errorFor(8)).toBeUndefined();
    expect(box.last().pending).toBe(false);
    expect(container.querySelector(".operation")!.textContent).toContain(
      "remove denied on :issue/status",
    );
  });

  test("error clears on the next successful run, and on clearError", async () => {
    const denied = new Unauthorized({ message: "no" });
    let fail = true;
    const db = fakeDb(() =>
      fail ? Promise.reject(denied) : Promise.resolve(report()),
    );
    const box = capture<Handle>();
    render(OperationHost, {
      props: { db, operation: bareOp, report: box.report },
    });

    await act(async () => {
      await box.last().run({ title: "x" });
    });
    expect(box.last().error).toBe(denied);

    fail = false;
    await act(async () => {
      await box.last().run({ title: "y" });
    });
    expect(box.last().error).toBeUndefined();

    fail = true;
    await act(async () => {
      await box.last().run({ title: "z" });
    });
    expect(box.last().error).toBe(denied);
    await act(() => box.last().clearError());
    expect(box.last().error).toBeUndefined();
    expect(box.last().errorFor({ title: "z" })).toBeUndefined();
  });

  test("the last settler wins error: a late failure re-sets it after a success cleared it", async () => {
    const denied = new Unauthorized({ message: "late denial" });
    const g = Promise.withResolvers<OpReport<unknown>>();
    let n = 0;
    const db = fakeDb(() => {
      n += 1;
      return n === 1
        ? g.promise.then(() => Promise.reject(denied))
        : Promise.resolve(report());
    });
    const box = capture<Handle>();
    render(OperationHost, {
      props: { db, operation: onOp, report: box.report },
    });

    let ranA!: Promise<RunResult<OpReport<unknown>>>;
    await act(() => {
      ranA = box.last().run(1, { done: true });
    });

    await act(async () => {
      await box.last().run(2, { done: false });
    });
    expect(box.last().error).toBeUndefined();

    g.resolve(report());
    await act(async () => {
      await ranA;
    });
    expect(box.last().error).toBe(denied);
    expect(box.last().errorFor(1)).toBe(denied);
    expect(box.last().errorFor(2)).toBeUndefined();
    expect(box.last().pending).toBe(false);
  });

  test("a run settling after unmount touches no state", async () => {
    const g = Promise.withResolvers<OpReport<unknown>>();
    const box = capture<Handle>();
    const { unmount } = render(OperationHost, {
      props: { db: fakeDb(() => g.promise), operation: bareOp, report: box.report },
    });

    let outcome!: Promise<RunResult<OpReport<unknown>>>;
    await act(() => {
      outcome = box.last().run({ title: "x" });
    });
    const renders = box.renders.length;
    unmount();

    g.resolve(report());
    expect(await outcome).toEqual({ ok: true, value: report() });
    expect(box.renders.length).toBe(renders);
  });

  test("a failure settling after unmount still fires onError, without touching state", async () => {
    const denied = new Unauthorized({ message: "denied after navigate-away" });
    const seen: unknown[] = [];
    const g = Promise.withResolvers<OpReport<unknown>>();
    const box = capture<Handle>();
    const { unmount } = render(OperationHost, {
      props: {
        db: fakeDb(() => g.promise.then(() => Promise.reject(denied))),
        operation: onOp,
        onError: (e: unknown) => seen.push(e),
        report: box.report,
      },
    });

    let outcome!: Promise<RunResult<OpReport<unknown>>>;
    await act(() => {
      outcome = box.last().run(1, { done: true });
    });
    const renders = box.renders.length;
    unmount();

    g.resolve(report());
    await outcome;
    expect(seen).toEqual([denied]);
    expect(box.renders.length).toBe(renders);
  });

  test("contextual run passes entity then input to db.run", async () => {
    const calls: unknown[] = [];
    const db = fakeDb(async (operation, a, b) => {
      calls.push([operation, a, b]);
      return report();
    });
    const box = capture<Handle>();
    render(OperationHost, {
      props: { db, operation: onOp, report: box.report },
    });
    await act(async () => {
      await box.last().run(9, { done: true });
    });
    expect(calls).toEqual([[onOp, 9, { done: true }]]);
  });
});
