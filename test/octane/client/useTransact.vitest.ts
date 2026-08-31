/**
 * The useTransact contract:
 *
 * - a successful `run` resolves `Exit.succeed`, and `pending` flips
 *   true → false around it;
 * - a failing `run` calls `onError` with the failure's error (the
 *   `Unauthorized` instance itself, not a cause wrapper) and lands the same
 *   value on `error`;
 * - a defect lands the squashed defect itself, not a Cause wrapper;
 * - `error` clears on the next successful run, and on `clearError`;
 * - concurrent runs settle independently: the last settler wins `error`;
 * - an unmounted component touches no state when a late run settles, but
 *   `onError` still fires (the toast host outlives the form);
 * - the `error` a failure lands renders through `errorMessage` (which
 *   `useReceipt.vitest.ts` pins on its own).
 *
 * Octane's `act` is always async (`act<T>(fn): Promise<T>`), so every
 * boundary here is awaited — unlike React's dual sync/async form.
 */

import { act, render } from "@octanejs/testing-library";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { Unauthorized } from "ramose/db";
import type { Transact } from "ramose/octane";
import { describe, expect, test } from "vitest";
import { TransactHost } from "../fixtures/writes.tsrx";
import { capture } from "../support/world.ts";

const pendingAttr = (container: HTMLElement) =>
  container.querySelector(".transact")!.getAttribute("data-pending");

describe("useTransact", () => {
  test("success resolves Exit.succeed and pending flips true → false", async () => {
    const box = capture<Transact>();
    const { container } = render(TransactHost, { props: { report: box.report } });
    expect(box.last().pending).toBe(false);

    const g = Promise.withResolvers<number>();
    let outcome!: Promise<Exit.Exit<number, never>>;
    await act(() => {
      outcome = box.last().run(Effect.promise(() => g.promise));
    });
    expect(box.last().pending).toBe(true);
    expect(pendingAttr(container)).toBe("true");

    g.resolve(42);
    const exit = await act(() => outcome);
    expect(exit).toEqual(Exit.succeed(42));
    expect(box.last().pending).toBe(false);
    expect(pendingAttr(container)).toBe("false");
    expect(box.last().error).toBeUndefined();
  });

  test("pending counts concurrent runs", async () => {
    const box = capture<Transact>();
    render(TransactHost, { props: { report: box.report } });

    const a = Promise.withResolvers<void>();
    const b = Promise.withResolvers<void>();
    let ranA!: Promise<Exit.Exit<void, never>>;
    let ranB!: Promise<Exit.Exit<void, never>>;
    await act(() => {
      ranA = box.last().run(Effect.promise(() => a.promise));
      ranB = box.last().run(Effect.promise(() => b.promise));
    });
    expect(box.last().pending).toBe(true);

    a.resolve();
    await act(() => ranA);
    expect(box.last().pending).toBe(true); // b still in flight

    b.resolve();
    await act(() => ranB);
    expect(box.last().pending).toBe(false);
  });

  test("failure calls onError with the Unauthorized instance and sets error", async () => {
    const denied = new Unauthorized({
      message: "retract denied on :issue/status",
      code: "policy",
      attr: ":issue/status",
    });
    const seen: unknown[] = [];
    const box = capture<Transact>();
    const { container } = render(TransactHost, {
      props: { onError: (error: unknown) => seen.push(error), report: box.report },
    });

    let exit!: Exit.Exit<never, Unauthorized>;
    await act(async () => {
      exit = await box.last().run(Effect.fail(denied));
    });

    expect(Exit.isFailure(exit)).toBe(true);
    expect(seen).toEqual([denied]);
    expect(seen[0]).toBe(denied); // the instance itself, not a cause wrapper
    expect(box.last().error).toBe(denied);
    expect(box.last().pending).toBe(false);
    expect(container.querySelector(".transact")!.textContent).toContain(
      "retract denied on :issue/status",
    );
  });

  test("a defect lands the squashed defect on error and onError", async () => {
    const seen: unknown[] = [];
    const box = capture<Transact>();
    render(TransactHost, {
      props: { onError: (error: unknown) => seen.push(error), report: box.report },
    });

    let exit!: Exit.Exit<never, never>;
    await act(async () => {
      exit = await box.last().run(Effect.die("boom"));
    });

    expect(Exit.isFailure(exit)).toBe(true);
    expect(seen).toEqual(["boom"]); // the defect itself, not a Cause wrapper
    expect(box.last().error).toBe("boom");
  });

  test("error clears on the next successful run, and on clearError", async () => {
    const denied = new Unauthorized({ message: "no" });
    const box = capture<Transact>();
    render(TransactHost, { props: { report: box.report } });

    await act(async () => {
      await box.last().run(Effect.fail(denied));
    });
    expect(box.last().error).toBe(denied);

    await act(async () => {
      await box.last().run(Effect.succeed("ok"));
    });
    expect(box.last().error).toBeUndefined();

    await act(async () => {
      await box.last().run(Effect.fail(denied));
    });
    expect(box.last().error).toBe(denied);

    await act(() => box.last().clearError());
    expect(box.last().error).toBeUndefined();
  });

  test("the last settler wins error: a late failure re-sets it after a success cleared it", async () => {
    const denied = new Unauthorized({ message: "late denial" });
    const box = capture<Transact>();
    render(TransactHost, { props: { report: box.report } });

    // run A starts first and will fail — but only when the gate opens
    const g = Promise.withResolvers<void>();
    let ranA!: Promise<Exit.Exit<void, Unauthorized>>;
    await act(() => {
      ranA = box
        .last()
        .run(
          Effect.promise(() => g.promise).pipe(Effect.andThen(Effect.fail(denied))),
        );
    });

    // run B starts later, settles first, and clears error
    await act(async () => {
      await box.last().run(Effect.succeed("ok"));
    });
    expect(box.last().error).toBeUndefined();

    // A settles last: its failure wins, start order notwithstanding
    g.resolve();
    await act(() => ranA);
    expect(box.last().error).toBe(denied);
    expect(box.last().pending).toBe(false);
  });

  test("a run settling after unmount touches no state", async () => {
    const box = capture<Transact>();
    const { unmount } = render(TransactHost, { props: { report: box.report } });

    const g = Promise.withResolvers<string>();
    let outcome!: Promise<Exit.Exit<string, never>>;
    await act(() => {
      outcome = box.last().run(Effect.promise(() => g.promise));
    });
    const renders = box.renders.length;
    unmount();

    g.resolve("late");
    const exit = await outcome;
    expect(exit).toEqual(Exit.succeed("late")); // the caller still gets the outcome
    // the unmounted host never rendered again: no state was touched
    expect(box.renders.length).toBe(renders);
  });

  test("a failure settling after unmount still fires onError, without touching state", async () => {
    const denied = new Unauthorized({ message: "denied after navigate-away" });
    const seen: unknown[] = [];
    const box = capture<Transact>();
    const { unmount } = render(TransactHost, {
      props: { onError: (error: unknown) => seen.push(error), report: box.report },
    });

    const g = Promise.withResolvers<void>();
    let outcome!: Promise<Exit.Exit<void, Unauthorized>>;
    await act(() => {
      outcome = box
        .last()
        .run(
          Effect.promise(() => g.promise).pipe(Effect.andThen(Effect.fail(denied))),
        );
    });
    const renders = box.renders.length;
    unmount();

    g.resolve();
    const exit = await outcome;
    expect(Exit.isFailure(exit)).toBe(true);
    expect(seen).toEqual([denied]); // the toast still happens
    expect(box.renders.length).toBe(renders);
  });
});
