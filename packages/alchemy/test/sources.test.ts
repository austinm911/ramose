/**
 * The three transports, at the seam where they differ: how a
 * {@link SystemSource} turns a system's *attributes* (Outputs, not values)
 * into "where do I send, with which token".
 *
 * The `RuntimeContext` here is the one a deployed Worker (or an
 * `Alchemy.Action`) would supply: `set` registers the value under a key while
 * the host initializes, `get` reads it back out of the environment later.
 * Faking it is the whole test — including *when* `set` is called, which is the
 * difference between a Worker that deploys with its bindings and one that
 * reads `undefined` on the first request.
 */

import { describe, expect, test } from "bun:test";
import { makeCaptureContext, makeResolveContext } from "alchemy/ActionRuntimeContext";
import * as Output from "alchemy/Output";
import { RuntimeContext } from "alchemy/RuntimeContext";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import type { System } from "../src/System.ts";
import { Self } from "alchemy/Self";
import { WorkerEnvironment } from "alchemy/Cloudflare/Workers";
import {
  makeBindingSource,
  makeSystemBinding,
  SERVICE_ORIGIN,
} from "../src/SystemBinding.ts";
import { makeHttpSource } from "../src/SystemHttp.ts";

/** A system whose attributes are literal Outputs, as after a deploy. */
const system = (attrs: {
  url: string;
  token?: Redacted.Redacted<string> | undefined;
}): System =>
  ({
    LogicalId: "Sys",
    FQN: "app/Sys",
    Type: "Ripple.System",
    url: Output.literal(attrs.url),
    peerName: Output.literal("ripple-peer"),
    token: Output.literal(attrs.token),
  }) as unknown as System;

/**
 * Evaluate the Output expressions the sources build — literals off the fake
 * system, and the `.map(…)` over the token. (The engine's own evaluator
 * needs a state store; these two node kinds are all that is in play here.)
 */
const evaluate = (expr: unknown): unknown => {
  const node = expr as { kind?: string; value?: unknown; expr?: unknown; f?: (v: unknown) => unknown };
  if (node?.kind === "LiteralExpr") return node.value;
  if (node?.kind === "ApplyExpr") return node.f!(evaluate(node.expr));
  return expr;
};

/** The env a deployed Worker would see: whatever `set` bound, keyed by name. */
const runtime = (env: Record<string, unknown> = {}) => {
  const bound: Record<string, unknown> = { ...env };
  return {
    bound,
    layer: Layer.succeed(RuntimeContext, {
      Type: "test",
      id: "test",
      env: bound,
      set: (key: string, output: Output.Output) =>
        Effect.sync(() => {
          bound[key] = evaluate(output);
          return key;
        }),
      get: <T>(key: string) => Effect.succeed(bound[key] as T | undefined),
    } as never),
  };
};

const resolve = <A>(eff: Effect.Effect<A, never, RuntimeContext>, layer: Layer.Layer<RuntimeContext>) =>
  Effect.runPromise(eff.pipe(Effect.provide(layer)));

describe("the service-binding source", () => {
  test("dispatches through env[LogicalId] against the synthetic origin", async () => {
    const seen: string[] = [];
    const env = {
      Sys: {
        fetch: (url: string) => {
          seen.push(url);
          return Promise.resolve(new Response("{}"));
        },
      },
    };
    const sys = system({ url: "https://peer.example.com" });
    const { layer } = runtime();
    const source = await resolve(makeBindingSource(env, sys), layer);

    const endpoint = await resolve(source.endpoint, layer);
    expect(endpoint.url).toBe(SERVICE_ORIGIN);

    await source.fetch(`${SERVICE_ORIGIN}/db/movies/info`, { method: "GET", headers: {} });
    expect(seen).toEqual([`${SERVICE_ORIGIN}/db/movies/info`]);
  });

  test("a missing service binding rejects with an actionable message", async () => {
    const { layer } = runtime();
    const source = await resolve(makeBindingSource({}, system({ url: "https://x" })), layer);
    await expect(
      source.fetch("https://ripple.internal/db/movies/info", { method: "GET", headers: {} }),
    ).rejects.toThrow(/no service binding "Sys"/);
  });

  test("only the token is bound — a system pins no database name", async () => {
    const sys = system({
      url: "https://peer.example.com",
      token: Redacted.make("s3cret"),
    });
    const { bound, layer } = runtime();
    const source = await resolve(makeBindingSource({}, sys), layer);

    expect(Object.keys(bound).sort()).toEqual(["Sys_TOKEN"]);
    expect(Object.keys(bound)).not.toContain("Sys_DB");
    const endpoint = await resolve(source.endpoint, layer);
    expect(Redacted.value(endpoint.token as Redacted.Redacted<string>)).toBe("s3cret");
  });
});

describe("the HTTP source", () => {
  test("takes the peer url from the attribute, and binds url + token only", async () => {
    const sys = system({ url: "https://peer.example.com" });
    const { bound, layer } = runtime();

    const source = await resolve(makeHttpSource(sys), layer);
    const endpoint = await resolve(source.endpoint, layer);

    expect(endpoint.url).toBe("https://peer.example.com");
    // no token configured → the empty string, which the client reads as "none"
    expect(endpoint.token).toBe("");
    expect(Object.keys(bound).sort()).toEqual(["Sys_TOKEN", "Sys_URL"]);
    expect(Object.keys(bound)).not.toContain("Sys_DB");
  });
});

/**
 * Regression: the binds must happen when the capability is BOUND, not when a
 * client method runs.
 *
 * A Worker's `Props.env` is snapshotted the instant its init Effect returns
 * (alchemy/Local/Platform.ts) and an Action's *capture* context is only
 * ambient during init (alchemy/ActionRuntimeContext.ts). Registering lazily,
 * from inside a request, registers nothing at all.
 */
describe("registration happens at bind time", () => {
  test("a Worker's env is populated before any client call", async () => {
    const sys = system({ url: "https://peer.example.com" });
    const { bound, layer } = runtime();

    // the init closure: bind the capability, return a handler, run nothing
    await resolve(
      Effect.gen(function* () {
        yield* makeHttpSource(sys);
      }),
      layer,
    );

    expect(Object.keys(bound).sort()).toEqual(["Sys_TOKEN", "Sys_URL"]);
  });

  test("an Action captures the outputs during init and reads them at apply", async () => {
    const sys = system({ url: "https://peer.example.com" });

    // init: the capture context records every Output the capability binds.
    const captures: Record<string, Output.Output> = {};
    const source = await Effect.runPromise(
      makeHttpSource(sys).pipe(
        Effect.provide(Layer.succeed(RuntimeContext, makeCaptureContext(captures) as never)),
      ),
    );
    expect(Object.keys(captures).sort()).toEqual(["Sys_TOKEN", "Sys_URL"]);

    // apply: the engine resolves what was captured; the accessors read it back.
    const resolved = Object.fromEntries(
      Object.entries(captures).map(([key, output]) => [key, evaluate(output)]),
    );
    const endpoint = await Effect.runPromise(
      source.endpoint.pipe(
        Effect.provide(Layer.succeed(RuntimeContext, makeResolveContext(resolved) as never)),
      ),
    );
    expect(endpoint.url).toBe("https://peer.example.com");
  });

  test("a host that registered nothing dies naming the key that is missing", async () => {
    const sys = system({ url: "https://peer.example.com" });
    // A context whose `set` is a no-op and whose `get` knows nothing — what an
    // Action sees at apply when the capture never happened, or a Worker whose
    // env is missing the binding. The endpoint must not fabricate
    // `https://undefined/db/undefined`.
    const blind = Layer.succeed(RuntimeContext, makeResolveContext({}) as never);
    const source = await Effect.runPromise(makeHttpSource(sys).pipe(Effect.provide(blind)));

    const error = await Effect.runPromise(
      source.endpoint.pipe(
        Effect.catchCause((cause) => Effect.succeed(String(Cause.squash(cause)))),
        Effect.provide(blind),
      ),
    );
    expect(error).toMatch(/no value bound under "Sys_URL"/);
  });
});

/**
 * The deploy-time half of the Binding layers: what they lower onto the host,
 * and the hosts they refuse.
 */
describe("the service binding the *SystemBinding layers lower", () => {
  /** A stand-in host Worker that records what was bound to it. */
  const worker = (bound: unknown[]) =>
    ({
      Type: "Cloudflare.Worker",
      LogicalId: "App",
      FQN: "app/App",
      bind:
        (..._template: unknown[]) =>
        (binding: unknown) =>
          Effect.sync(() => {
            bound.push(binding);
          }),
    }) as never;

  const bind = (
    host: unknown,
    sys: System,
    env: Record<string, unknown> = {},
    layer = runtime().layer,
  ) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const make = yield* makeSystemBinding({ makeClient: (s) => s });
        return yield* make(sys);
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(WorkerEnvironment, env as never),
            Layer.succeed(Self, host as never),
            layer,
          ),
        ),
      ),
    );

  const withPeer = (peer: unknown): System => {
    const sys = system({ url: "https://peer.example.com" });
    return Object.assign(sys as object, { Props: { peer } }) as System;
  };

  test("a Worker host gets one `service` binding named after the logical id", async () => {
    const bound: unknown[] = [];
    await bind(worker(bound), withPeer({ Type: "Cloudflare.Worker", LogicalId: "Peer" }));
    expect(bound).toHaveLength(1);
    const bindings = (bound[0] as { bindings: { type: string; name: string }[] }).bindings;
    expect(bindings).toHaveLength(1);
    expect(bindings[0].type).toBe("service");
    expect(bindings[0].name).toBe("Sys");
  });

  test("a bare-URL peer is refused — a service binding needs a script name", async () => {
    const bound: unknown[] = [];
    await expect(bind(worker(bound), withPeer("https://peer.example.com"))).rejects.toThrow(
      /bare URL peer/,
    );
    expect(bound).toEqual([]);
  });

  test("a host that is not a Worker is refused, naming its type", async () => {
    await expect(
      bind({ Type: "AWS.Lambda.Function", LogicalId: "Fn" }, withPeer("x")),
    ).rejects.toThrow(/AWS\.Lambda\.Function/);
  });
});
