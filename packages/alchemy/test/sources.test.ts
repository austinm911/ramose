/**
 * The three transports, at the seam where they differ: how a
 * {@link DatabaseSource} turns a database's *attributes* (Outputs, not
 * values) into "where do I send, as what, with which token".
 *
 * The `RuntimeContext` here is the one a deployed Worker would supply: `set`
 * registers the value under a key at deploy time, `get` reads it back out of
 * the environment at runtime. Faking it is the whole test.
 */

import { describe, expect, test } from "bun:test";
import * as Output from "alchemy/Output";
import { RuntimeContext } from "alchemy/RuntimeContext";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import type { Database } from "../src/Database.ts";
import { makeBindingSource, SERVICE_ORIGIN } from "../src/DatabaseBinding.ts";
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
    const source = makeBindingSource(env, db);
    const { layer } = runtime();

    const endpoint = await resolve(source.endpoint, layer);
    expect(endpoint.url).toBe(SERVICE_ORIGIN);
    expect(endpoint.name).toBe("movies");

    await source.fetch(`${SERVICE_ORIGIN}/db/movies/info`, { method: "GET", headers: {} });
    expect(seen).toEqual([`${SERVICE_ORIGIN}/db/movies/info`]);
  });

  test("a missing service binding rejects with an actionable message", async () => {
    const source = makeBindingSource({}, database({ name: "movies", url: "https://x" }));
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
    const endpoint = await resolve(makeBindingSource({}, db).endpoint, layer);

    expect(Object.keys(bound).sort()).toEqual(["Movies_DB", "Movies_TOKEN"]);
    expect(Redacted.value(endpoint.token as Redacted.Redacted<string>)).toBe("s3cret");
  });
});

describe("the HTTP source", () => {
  test("takes the peer url from the attribute, and binds url + name + token", async () => {
    const db = database({ name: "movies", url: "https://peer.example.com" });
    const { bound, layer } = runtime();

    const endpoint = await resolve(makeHttpSource(db).endpoint, layer);

    expect(endpoint.url).toBe("https://peer.example.com");
    expect(endpoint.name).toBe("movies");
    // no token configured → the empty string, which the client reads as "none"
    expect(endpoint.token).toBe("");
    expect(Object.keys(bound).sort()).toEqual(["Movies_DB", "Movies_TOKEN", "Movies_URL"]);
  });
});
