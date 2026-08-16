/**
 * The three transports, at the seam where they differ: how a
 * {@link DatabaseSource} turns a database's *attributes* (Outputs, not
 * values) into "where do I send, as what, with which token".
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
import type { Database } from "../src/Database.ts";
import { Self } from "alchemy/Self";
import { WorkerEnvironment } from "alchemy/Cloudflare/Workers";
import {
  makeBindingSource,
  makeDatabaseBinding,
  SERVICE_ORIGIN,
} from "../src/DatabaseBinding.ts";
import { makeHttpSource } from "../src/DatabaseHttp.ts";

/** A database whose attributes are literal Outputs, as after a deploy. */
const database = (attrs: {
  name: string;
  url: string;
  token?: Redacted.Redacted<string> | undefined;
}): Database =>
  ({
    LogicalId: "Movies",
    FQN: "app/Movies",
    Type: "Ripple.Database",
    name: Output.literal(attrs.name),
    url: Output.literal(attrs.url),
    databaseUrl: Output.literal(`${attrs.url}/db/${attrs.name}`),
    peerName: Output.literal("ripple-peer"),
    token: Output.literal(attrs.token),
  }) as unknown as Database;

/**
 * Evaluate the Output expressions the sources build — literals off the fake
 * database, and the `.map(…)` over the token. (The engine's own evaluator
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
      Movies: {
        fetch: (url: string) => {
          seen.push(url);
          return Promise.resolve(new Response("{}"));
        },
      },
    };
    const db = database({ name: "movies", url: "https://peer.example.com" });
    const { layer } = runtime();
    const source = await resolve(makeBindingSource(env, db), layer);

    const endpoint = await resolve(source.endpoint, layer);
    expect(endpoint.url).toBe(SERVICE_ORIGIN);
    expect(endpoint.name).toBe("movies");

    await source.fetch(`${SERVICE_ORIGIN}/db/movies/info`, { method: "GET", headers: {} });
    expect(seen).toEqual([`${SERVICE_ORIGIN}/db/movies/info`]);
  });

  test("a missing service binding rejects with an actionable message", async () => {
    const { layer } = runtime();
    const source = await resolve(
      makeBindingSource({}, database({ name: "movies", url: "https://x" })),
      layer,
    );
    await expect(
      source.fetch("https://ripple.internal/db/movies/info", { method: "GET", headers: {} }),
    ).rejects.toThrow(/no service binding "Movies"/);
  });

  test("the name and token are bound under stable env keys", async () => {
    const db = database({
      name: "movies",
      url: "https://peer.example.com",
      token: Redacted.make("s3cret"),
    });
    const { bound, layer } = runtime();
    const source = await resolve(makeBindingSource({}, db), layer);

    expect(Object.keys(bound).sort()).toEqual(["Movies_DB", "Movies_TOKEN"]);
    const endpoint = await resolve(source.endpoint, layer);
    expect(Redacted.value(endpoint.token as Redacted.Redacted<string>)).toBe("s3cret");
  });
});

describe("the HTTP source", () => {
  test("takes the peer url from the attribute, and binds url + name + token", async () => {
    const db = database({ name: "movies", url: "https://peer.example.com" });
    const { bound, layer } = runtime();

    const source = await resolve(makeHttpSource(db), layer);
    const endpoint = await resolve(source.endpoint, layer);

    expect(endpoint.url).toBe("https://peer.example.com");
    expect(endpoint.name).toBe("movies");
    // no token configured → the empty string, which the client reads as "none"
    expect(endpoint.token).toBe("");
    expect(Object.keys(bound).sort()).toEqual(["Movies_DB", "Movies_TOKEN", "Movies_URL"]);
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
    const db = database({ name: "movies", url: "https://peer.example.com" });
    const { bound, layer } = runtime();

    // the init closure: bind the capability, return a handler, run nothing
    await resolve(
      Effect.gen(function* () {
        yield* makeHttpSource(db);
      }),
      layer,
    );

    expect(Object.keys(bound).sort()).toEqual(["Movies_DB", "Movies_TOKEN", "Movies_URL"]);
  });

  test("an Action captures the outputs during init and reads them at apply", async () => {
    const db = database({ name: "movies", url: "https://peer.example.com" });

    // init: the capture context records every Output the capability binds.
    const captures: Record<string, Output.Output> = {};
    const source = await Effect.runPromise(
      makeHttpSource(db).pipe(
        Effect.provide(Layer.succeed(RuntimeContext, makeCaptureContext(captures) as never)),
      ),
    );
    expect(Object.keys(captures).sort()).toEqual(["Movies_DB", "Movies_TOKEN", "Movies_URL"]);

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
    expect(endpoint.name).toBe("movies");
  });

  test("a host that registered nothing dies naming the key that is missing", async () => {
    const db = database({ name: "movies", url: "https://peer.example.com" });
    // A context whose `set` is a no-op and whose `get` knows nothing — what an
    // Action sees at apply when the capture never happened, or a Worker whose
    // env is missing the binding. The endpoint must not fabricate
    // `https://undefined/db/undefined`.
    const blind = Layer.succeed(RuntimeContext, makeResolveContext({}) as never);
    const source = await Effect.runPromise(makeHttpSource(db).pipe(Effect.provide(blind)));

    const error = await Effect.runPromise(
      source.endpoint.pipe(
        Effect.catchCause((cause) => Effect.succeed(String(Cause.squash(cause)))),
        Effect.provide(blind),
      ),
    );
    expect(error).toMatch(/no value bound under "Movies_URL"/);
  });
});

/**
 * The deploy-time half of the Binding layers: what they lower onto the host,
 * and the hosts they refuse.
 */
describe("the service binding the *DatabaseBinding layers lower", () => {
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
    db: Database,
    env: Record<string, unknown> = {},
    layer = runtime().layer,
  ) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const make = yield* makeDatabaseBinding({ makeClient: (s) => s });
        return yield* make(db);
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

  const withPeer = (peer: unknown): Database => {
    const db = database({ name: "movies", url: "https://peer.example.com" });
    return Object.assign(db as object, { Props: { peer, name: "movies" } }) as Database;
  };

  test("a Worker host gets one `service` binding named after the logical id", async () => {
    const bound: unknown[] = [];
    await bind(worker(bound), withPeer({ Type: "Cloudflare.Worker", LogicalId: "Peer" }));
    expect(bound).toHaveLength(1);
    const bindings = (bound[0] as { bindings: { type: string; name: string }[] }).bindings;
    expect(bindings).toHaveLength(1);
    expect(bindings[0].type).toBe("service");
    expect(bindings[0].name).toBe("Movies");
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
