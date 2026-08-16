/**
 * Admission for `GET /db/:name/write-ws` — the checks `handle()` runs before the
 * route ever reaches the Transactor DO (index.ts imports `cloudflare:workers` via
 * the DO classes, so the helpers are tested directly, as in basis-cache.test.ts):
 *   - database name validation (the upgrade URL is the same /db/:name/ path)
 *   - one shared bearer token, as a header or as `?token=` (WebSocket clients
 *     cannot set headers), and auth off when RIPPLE_TOKEN is unset
 *   - the AE route label for the new path
 */
import { describe, expect, test } from "bun:test";
import type { RippleEnv } from "@ripple/transactor";
import { authorized, validDbName } from "../src/auth.ts";
import { routeOf } from "../src/analytics.ts";

const env = (token?: string) => ({ RIPPLE_TOKEN: token }) as unknown as RippleEnv;

const wsReq = (opts: { db?: string; token?: string; header?: string } = {}) => {
  const db = opts.db ?? "demo";
  const qs = opts.token !== undefined ? `?token=${encodeURIComponent(opts.token)}` : "";
  const headers: Record<string, string> = { Upgrade: "websocket", Connection: "Upgrade" };
  if (opts.header !== undefined) headers.authorization = opts.header;
  return new Request(`https://ripple.example/db/${db}/write-ws${qs}`, { headers });
};

describe("write-ws: database name", () => {
  test("accepts the names the HTTP routes accept", () => {
    for (const n of ["demo", "a", "tenant-acme", "db_1.v2", "A0", "x".repeat(64)]) expect(validDbName(n)).toBe(true);
  });

  test("rejects invalid names", () => {
    for (const n of ["bad/name", "", "x".repeat(65), "-lead", ".lead", "_lead", "has space", "café"]) expect(validDbName(n)).toBe(false);
  });
});

describe("write-ws: auth", () => {
  test("auth off when RIPPLE_TOKEN is unset", () => {
    expect(authorized(env(undefined), wsReq())).toBe(true);
    expect(authorized(env(""), wsReq({ token: "anything" }))).toBe(true);
  });

  test("token set: no credentials → unauthorized", () => {
    expect(authorized(env("s3cret"), wsReq())).toBe(false);
  });

  test("token set: wrong bearer / wrong ?token= → unauthorized", () => {
    expect(authorized(env("s3cret"), wsReq({ header: "Bearer nope" }))).toBe(false);
    expect(authorized(env("s3cret"), wsReq({ token: "nope" }))).toBe(false);
    expect(authorized(env("s3cret"), wsReq({ header: "s3cret" }))).toBe(false); // missing "Bearer "
  });

  test("token set: right bearer → authorized", () => {
    expect(authorized(env("s3cret"), wsReq({ header: "Bearer s3cret" }))).toBe(true);
  });

  test("token set: right ?token= → authorized (browser/Bun WS cannot send headers)", () => {
    expect(authorized(env("s3cret"), wsReq({ token: "s3cret" }))).toBe(true);
  });

  test("an authorization header, even a wrong one, wins over ?token=", () => {
    expect(authorized(env("s3cret"), wsReq({ header: "Bearer nope", token: "s3cret" }))).toBe(false);
  });
});

describe("write-ws: analytics label", () => {
  test("routeOf tags the upgrade as write-ws", () => {
    expect(routeOf("/write-ws", "GET")).toBe("write-ws");
    expect(routeOf("/transact", "POST")).toBe("transact"); // POST path unchanged
  });
});
