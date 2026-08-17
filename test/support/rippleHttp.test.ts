/**
 * Ops HTTP harness: transient Cloudflare platform errors must retry without
 * dumping the workers.dev HTML body into the test reporter.
 */
import { describe, expect, test } from "bun:test";
import {
  HttpError,
  isTransientCf,
  Peer,
} from "./rippleHttp.ts";

const html404 = `<!DOCTYPE html><html><head><title>Page not found</title></head>
<body><h1>There is nothing here yet</h1>${"<svg></svg>".repeat(200)}</body></html>`;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("Peer — Cloudflare platform retries", () => {
  test("retries workers.dev HTML 404 then succeeds", async () => {
    let n = 0;
    const inits: RequestInit[] = [];
    const peer = new Peer("https://example.workers.dev", {
      retryTransient: 4,
      fetch: (async (_url: string | URL | Request, init?: RequestInit) => {
        n++;
        inits.push(init ?? {});
        if (n < 3) return new Response(html404, { status: 404 });
        return json(200, { ok: true, stage: "e2e" });
      }) as unknown as typeof fetch,
    });
    const h = await peer.health();
    expect(h.ok).toBe(true);
    expect(n).toBe(3);
    expect(inits[0]?.keepalive).toBe(true);
    expect(inits[1]?.keepalive).toBe(false);
    expect(inits[2]?.keepalive).toBe(false);
  });

  test("retries error 1104 then succeeds", async () => {
    let n = 0;
    const peer = new Peer("https://example.workers.dev", {
      retryTransient: 3,
      fetch: (async () => {
        n++;
        if (n === 1) return new Response("error code: 1104", { status: 500 });
        return json(200, { ok: true, stage: "e2e" });
      }) as unknown as typeof fetch,
    });
    expect((await peer.health()).ok).toBe(true);
    expect(n).toBe(2);
  });

  test("retries Worker not found JSON 500 then succeeds", async () => {
    let n = 0;
    const peer = new Peer("https://example.workers.dev", {
      retryTransient: 3,
      fetch: (async () => {
        n++;
        if (n === 1) {
          return json(500, { error: "Worker not found.", stack: "Error: Worker not found." });
        }
        return json(200, { ok: true, stage: "e2e" });
      }) as unknown as typeof fetch,
    });
    expect((await peer.health()).ok).toBe(true);
    expect(n).toBe(2);
  });

  test("does not retry an application 409", async () => {
    let n = 0;
    const peer = new Peer("https://example.workers.dev", {
      retryTransient: 8,
      fetch: (async () => {
        n++;
        return json(409, { error: "unique conflict", code: "tx/unique-conflict" });
      }) as unknown as typeof fetch,
    });
    try {
      await peer.db("x").transact([{ ":user/name": "a" }]);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).status).toBe(409);
      expect((e as HttpError).code).toBe("tx/unique-conflict");
    }
    expect(n).toBe(1);
  });

  test("truncates workers.dev HTML so the reporter stays readable", async () => {
    const peer = new Peer("https://example.workers.dev", {
      retryTransient: 0,
      fetch: (async () => new Response(html404, { status: 404 })) as unknown as typeof fetch,
    });
    try {
      await peer.health();
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      const err = e as HttpError;
      expect(err.status).toBe(404);
      expect(err.message.length).toBeLessThan(120);
      expect(err.message).toContain("workers.dev edge");
      expect(isTransientCf(err)).toBe(true);
    }
  });
});
