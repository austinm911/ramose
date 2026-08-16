/**
 * Request admission for the peer Worker: database-name validation and the one
 * shared bearer token. Pure (no `cloudflare:workers` import), so it is unit
 * tested under Bun — index.ts, which exports the DO classes, is not importable
 * there.
 */

import type { RippleEnv } from "@ripple/transactor";

/**
 * One shared bearer token (`RIPPLE_TOKEN`) for every database name; unset = auth off.
 * Accepted as `Authorization: Bearer <token>` or `?token=<token>` — WebSocket
 * clients (browser / Bun) cannot set headers, so they use the query parameter.
 */
export function authorized(env: RippleEnv, request: Request): boolean {
  if (!env.RIPPLE_TOKEN) return true;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : new URL(request.url).searchParams.get("token") ?? "";
  return token === env.RIPPLE_TOKEN;
}

export function validDbName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(name);
}
