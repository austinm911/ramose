/**
 * The `useReceipt` contract — one invocation, observed as it settles:
 *
 * - no receipt reads `idle`, which is a different state from `pending`, so a
 *   form can tell "not submitted" from "submitting" with no second flag;
 * - `pending` → `queued` → `committed` each re-render;
 * - a rejection carries the server's own `code`, passed through uninterpreted;
 * - a failure carries the `Error` it was given;
 * - a receipt that settled before a component mounted reads its terminal state
 *   on the first render — there is no replay of the states it passed through;
 * - unmounting cancels nothing: a queued invocation is durable and settles
 *   without an observer;
 * - swapping receipts switches which invocation is reported. Two receipts are
 *   two invocations, never the same one under another name.
 *
 * The receipts here come from the client's own `ReceiptDriver` (see
 * `support/world.ts`), so they are exactly what `db.mutate.…()` hands back:
 * same state machine, same refusal to be settled twice.
 *
 * Octane's `act` is always async (`act<T>(fn): Promise<T>`), so every boundary
 * that publishes into a store is awaited.
 */

import { act, render } from "@octanejs/testing-library";
import { MutationRejectedError } from "ramose/client";
import { Unauthorized } from "ramose/db";
import { errorMessage, type ReceiptView } from "ramose/octane";
import { describe, expect, test } from "vitest";
import { ReceiptProbe } from "../fixtures/writes.tsrx";
import { capture, invocation } from "../support/world.ts";

const statusAttr = (container: HTMLElement) =>
  container.querySelector(".receipt")!.getAttribute("data-status");

/** Narrow, loudly: an assertion on `error` needs the branch that carries one. */
const asRejected = (view: ReceiptView) => {
  if (view.status !== "rejected") {
    throw new Error(`expected a rejected receipt, got ${view.status}`);
  }
  return view;
};

describe("useReceipt", () => {
  test("no receipt reads idle, and idle is not pending", () => {
    const box = capture<ReceiptView>();
    const { container, rerender } = render(ReceiptProbe, {
      props: { report: box.report },
    });

    // the render before the user acts: the hook is called unconditionally
    expect(box.last().status).toBe("idle");
    expect(statusAttr(container)).toBe("idle");

    rerender({ props: { receipt: null, report: box.report } });
    expect(box.last().status).toBe("idle");

    // the same component, now holding a real invocation: a distinct state, so
    // "not submitted" and "submitting" need no second flag beside the receipt
    rerender({ props: { receipt: invocation().receipt, report: box.report } });
    expect(box.last().status).toBe("pending");
    expect(statusAttr(container)).toBe("pending");
  });

  test("pending → queued → committed, re-rendering at each transition", async () => {
    const inv = invocation("addTodo");
    const box = capture<ReceiptView>();
    const { container } = render(ReceiptProbe, {
      props: { receipt: inv.receipt, report: box.report },
    });
    expect(box.last().status).toBe("pending");

    await act(() => {
      inv.queue();
    });
    expect(box.last().status).toBe("queued");
    expect(statusAttr(container)).toBe("queued");

    await act(() => {
      inv.commit();
    });
    expect(box.last().status).toBe("committed");
    expect(statusAttr(container)).toBe("committed");

    // one render per transition, and none of them saw a state out of order
    expect(box.renders.map((view) => view.status)).toEqual([
      "pending",
      "queued",
      "committed",
    ]);
  });

  test("a rejection reports the server's code, uninterpreted", async () => {
    const inv = invocation();
    const box = capture<ReceiptView>();
    const { container } = render(ReceiptProbe, {
      props: { receipt: inv.receipt, report: box.report },
    });

    await act(() => {
      inv.reject("tenant-quota-exhausted");
    });

    const view = asRejected(box.last());
    expect(view.error).toBeInstanceOf(MutationRejectedError);
    // the server's own opaque classification, neither remapped nor normalised
    expect(view.error.code).toBe("tenant-quota-exhausted");
    expect(statusAttr(container)).toBe("rejected");
    expect(container.querySelector(".receipt")!.textContent).toContain(
      "tenant-quota-exhausted",
    );
  });

  test("a failure carries the Error it was given", async () => {
    const boom = new Error("the outbox write threw");
    const inv = invocation();
    const box = capture<ReceiptView>();
    const { container } = render(ReceiptProbe, {
      props: { receipt: inv.receipt, report: box.report },
    });

    await act(() => {
      inv.fail(boom);
    });

    const view = box.last();
    if (view.status !== "failed") {
      throw new Error(`expected a failed receipt, got ${view.status}`);
    }
    expect(view.error).toBe(boom);
    expect(statusAttr(container)).toBe("failed");
    expect(container.querySelector(".receipt")!.textContent).toContain(
      "the outbox write threw",
    );
  });

  test("a receipt settled before mount reads its terminal state on the first render", () => {
    const inv = invocation();
    inv.commit();

    const box = capture<ReceiptView>();
    const { container } = render(ReceiptProbe, {
      props: { receipt: inv.receipt, report: box.report },
    });

    // no replay: the states it passed through are gone, only where it landed
    expect(box.renders.map((view) => view.status)).toEqual(["committed"]);
    expect(statusAttr(container)).toBe("committed");
  });

  test("unmounting cancels nothing: the invocation still settles", async () => {
    const inv = invocation();
    const box = capture<ReceiptView>();
    const { unmount } = render(ReceiptProbe, {
      props: { receipt: inv.receipt, report: box.report },
    });
    const renders = box.renders.length;
    unmount();

    inv.queue();
    inv.commit();
    await inv.receipt.committed;

    // nobody is watching, so the receipt itself is the witness
    expect(inv.receipt.getSnapshot().status).toBe("committed");
    expect(box.renders.length).toBe(renders);
  });

  test("swapping receipts switches which invocation is reported", async () => {
    const first = invocation("addTodo");
    const second = invocation("renameTodo");
    const box = capture<ReceiptView>();
    const { container, rerender } = render(ReceiptProbe, {
      props: { receipt: first.receipt, report: box.report },
    });

    await act(() => {
      first.queue();
    });
    expect(box.last().status).toBe("queued");

    // the second invocation is untouched, so the swap shows its own state
    rerender({ props: { receipt: second.receipt, report: box.report } });
    expect(box.last().status).toBe("pending");

    // settling the one no longer held reports nothing here
    await act(() => {
      first.commit();
    });
    expect(box.last().status).toBe("pending");
    expect(first.receipt.getSnapshot().status).toBe("committed");

    await act(() => {
      second.reject("conflict");
    });
    expect(asRejected(box.last()).error.code).toBe("conflict");
    expect(statusAttr(container)).toBe("rejected");
  });
});

/**
 * `errorMessage` lives here because this is where the errors a renderer shows
 * come from: `rejected` and `failed` both hand a component an error and nothing
 * else to say about it.
 */
describe("errorMessage", () => {
  test("a client error's message wins over its tag", () => {
    const denied = new Unauthorized({
      message: "retract denied on :issue/status",
    });
    expect(denied._tag).toBe("Unauthorized"); // both fields are present
    expect(errorMessage(denied)).toBe("retract denied on :issue/status");
  });

  test("a rejection's message names the code the server sent", () => {
    expect(errorMessage(new MutationRejectedError("policy"))).toContain("policy");
  });

  test("a _tag-only error falls back to the tag", () => {
    expect(errorMessage({ _tag: "TxRejected" })).toBe("TxRejected");
  });

  test("anything else goes through String", () => {
    expect(errorMessage("boom")).toBe("boom");
    expect(errorMessage(7)).toBe("7");
    expect(errorMessage(new Error("plain"))).toBe("plain");
  });
});
