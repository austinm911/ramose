/**
 * SSR: every server-reachable hook renders synchronously under `octane/server`,
 * with no DOM and no subscriptions.
 *
 * Bare `octane` is aliased to `octane/server` by `vitest.ssr.config.ts`, so the
 * hooks under test are the server twins — the ones that never run effects.
 * Query hooks must land on `pending`; `useSuspenseQuery` must do the same
 * outside a browser. If that guard regresses, every SSR render of a consuming
 * app hangs, and nothing else in this suite would catch it.
 */

import * as octaneRuntime from "octane";
import { renderToStaticMarkup } from "octane/server";
import { describe, expect, test } from "vitest";
import {
  BareRamose,
  ServerDb,
  ServerQuery,
  ServerRamose,
  ServerReceiptIdle,
  ServerReceiptSettled,
  ServerSuspenseQuery,
  ServerSync,
} from "../fixtures/server.tsrx";
import { invocation, todoWorld } from "../support/world.ts";

describe("ramose/octane on the server", () => {
  test("the binding's bare `octane` import is the server runtime", () => {
    // What an SSR build's own resolution does, and what vitest.ssr.config.ts
    // reproduces with an alias. Without it the hooks under test would be the
    // client twins and this suite would be testing the wrong runtime.
    expect("renderToStaticMarkup" in octaneRuntime).toBe(true);
    expect("createRoot" in octaneRuntime).toBe(false);
  });

  test("there is no DOM in this environment", () => {
    expect(typeof document).toBe("undefined");
  });

  test("useQuery renders pending and does not read data", () => {
    const world = todoWorld("live");
    const { html, css } = renderToStaticMarkup(ServerQuery, {
      client: world.client,
    });

    expect(html).toBe('<p id="query">pending</p>');
    expect(css).toBe("");
  });

  test("useSuspenseQuery does not suspend on the server — it renders pending", () => {
    // The valuable case: `typeof document !== "undefined"` must keep this
    // render completing. A regression hangs or throws every SSR consumer.
    const world = todoWorld("live");
    const { html } = renderToStaticMarkup(ServerSuspenseQuery, {
      client: world.client,
    });

    expect(html).toBe('<p id="suspense">pending</p>');
  });

  test("useDb opens the root during a server render without activating storage", () => {
    const world = todoWorld("live");
    const { html } = renderToStaticMarkup(ServerDb, {
      client: world.client,
    });

    expect(html).toBe('<p id="db">open</p>');
  });

  test("useRamose returns the provided client on the server", () => {
    const world = todoWorld("live");
    const { html } = renderToStaticMarkup(ServerRamose, {
      client: world.client,
    });

    expect(html).toBe('<p id="ramose">provided</p>');
  });

  test("useRamose throws with no provider", () => {
    expect(() => renderToStaticMarkup(BareRamose)).toThrow(/RamoseProvider/);
  });

  test("useSyncState reads the client's current status synchronously", () => {
    const world = todoWorld("live");
    const { html } = renderToStaticMarkup(ServerSync, {
      client: world.client,
    });

    expect(html).toBe('<p id="sync">live</p>');
  });

  test("useReceipt(null) is idle on the server", () => {
    const { html } = renderToStaticMarkup(ServerReceiptIdle);

    expect(html).toBe('<p id="receipt">idle</p>');
  });

  test("useReceipt reads a settled receipt's terminal state on the server", () => {
    const call = invocation();
    call.commit();

    const { html } = renderToStaticMarkup(ServerReceiptSettled, {
      receipt: call.receipt,
    });

    expect(html).toBe('<p id="receipt">committed</p>');
  });
});
