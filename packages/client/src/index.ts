/**
 * Ripple client SDK (thin). Works in browsers, Bun, Node, Workers.
 *
 *   const ripple = new RippleClient("https://ripple.example.workers.dev", { token });
 *   const db = ripple.db("app");
 *   await db.transact([{ ":user/name": "Ada" }]);
 *   await db.q(`[:find ?n :where [?e :user/name ?n]]`);
 *   await db.asOf(42).q(...);   await db.history().q(...);
 *   await db.pull(eid, "[*]");
 */

import { fromJson, toJson } from "@ripple/core";
import type { TxData } from "@ripple/core";

export interface ClientOptions {
  token?: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

export interface TxAck {
  t: number;
  txEid: number;
  tempids: Record<string, number>;
  datoms: number;
}

export interface QueryResponse<T = unknown> {
  t: number;
  root: number;
  result: T;
  explain?: unknown[];
  meta: { ms: number | null; r2Gets: number | null; cacheHits: number | null };
}

export class RippleError extends Error {
  constructor(msg: string, readonly status: number, readonly code?: string) {
    super(msg);
  }
}

export class RippleClient {
  readonly base: string;
  private readonly f: typeof fetch;
  constructor(base: string, readonly opts: ClientOptions = {}) {
    this.base = base.replace(/\/+$/, "");
    this.f = opts.fetch ?? fetch.bind(globalThis);
  }

  db(name: string): RippleDb {
    return new RippleDb(this, name);
  }

  async health(): Promise<{ ok: boolean; stage: string }> {
    return this.request("GET", "/health");
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json", ...(this.opts.headers ?? {}) };
    if (this.opts.token) headers.authorization = `Bearer ${this.opts.token}`;
    const res = await this.f(this.base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(toJson(body)) });
    const text = await res.text();
    let parsed: any;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { error: text };
    }
    if (!res.ok) throw new RippleError(parsed?.error ?? `HTTP ${res.status}`, res.status, parsed?.code);
    const out = fromJson(parsed) as any;
    if (out && typeof out === "object" && !Array.isArray(out)) {
      out.meta = { ms: num(res.headers.get("x-ripple-ms")), r2Gets: num(res.headers.get("x-ripple-r2-gets")), cacheHits: num(res.headers.get("x-ripple-cache-hits")) };
    }
    return out as T;
  }
}

function num(s: string | null): number | null {
  return s === null ? null : Number(s);
}

export class RippleDb {
  constructor(
    readonly client: RippleClient,
    readonly name: string,
    private readonly asOfT?: number,
    private readonly hist = false,
  ) {}

  private path(p: string): string {
    return `/db/${encodeURIComponent(this.name)}${p}`;
  }

  /** Read-only view as of transaction `t`. */
  asOf(t: number): RippleDb {
    return new RippleDb(this.client, this.name, t, this.hist);
  }
  /** History view (asserts and retracts, with tx and op). */
  history(): RippleDb {
    return new RippleDb(this.client, this.name, this.asOfT, true);
  }

  transact(tx: TxData): Promise<TxAck> {
    return this.client.request<TxAck>("POST", this.path("/transact"), { tx });
  }

  async q<T = any>(query: string | object, inputs: unknown[] = [], opts: { explain?: boolean } = {}): Promise<T> {
    const r = await this.query<T>(query, inputs, opts);
    return r.result;
  }

  query<T = any>(query: string | object, inputs: unknown[] = [], opts: { explain?: boolean } = {}): Promise<QueryResponse<T>> {
    return this.client.request<QueryResponse<T>>("POST", this.path("/query"), { query, inputs, asOf: this.asOfT, history: this.hist || undefined, explain: opts.explain });
  }

  async pull<T = Record<string, unknown> | null>(eid: number | string | [string, unknown], pattern: string | unknown[]): Promise<T> {
    const r = await this.client.request<{ result: T }>("POST", this.path("/pull"), { eid, pattern, asOf: this.asOfT, history: this.hist || undefined });
    return r.result;
  }

  async entity(eid: number): Promise<Record<string, unknown> | undefined> {
    const r = await this.client.request<{ entity: Record<string, unknown> | null }>("GET", this.path(`/entity/${eid}${this.asOfT !== undefined ? `?asOf=${this.asOfT}` : ""}`));
    return r.entity ?? undefined;
  }

  info(): Promise<any> {
    return this.client.request("GET", this.path("/info"));
  }
  /** Force an index run (admin). */
  index(): Promise<any> {
    return this.client.request("POST", this.path("/admin/index"));
  }
  gc(): Promise<any> {
    return this.client.request("POST", this.path("/admin/gc"));
  }
}

/** Convenience for schema installs. */
export function attribute(ident: string, valueType: string, opts: { cardinality?: "one" | "many"; unique?: "identity" | "value"; index?: boolean; isComponent?: boolean; doc?: string } = {}) {
  const m: Record<string, unknown> = {
    ":db/ident": ident,
    ":db/valueType": valueType.startsWith(":") ? valueType : `:db.type/${valueType}`,
    ":db/cardinality": `:db.cardinality/${opts.cardinality ?? "one"}`,
  };
  if (opts.unique) m[":db/unique"] = `:db.unique/${opts.unique}`;
  if (opts.index) m[":db/index"] = true;
  if (opts.isComponent) m[":db/isComponent"] = true;
  if (opts.doc) m[":db/doc"] = opts.doc;
  return m;
}
