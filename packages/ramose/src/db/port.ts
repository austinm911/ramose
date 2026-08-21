/**
 * Tab ↔ follower port protocol. Structured-cloneable only — no Connection,
 * no raw datoms, no passwords. The worker owns overlay / session / persist /
 * outbox; each tab holds a {@link MessagePort} and speaks this API.
 */

import {
  type DbError,
  DatabaseNotFound,
  InternalError,
  InvalidRequest,
  NetworkError,
  QueryBudgetExceeded,
  TxRejected,
  Unauthorized,
  Unavailable,
  isDatabaseError,
} from "./Errors.ts";

export interface PortLike {
  postMessage(data: unknown): void;
  addEventListener(
    type: "message" | "messageerror",
    cb: (ev: MessageEvent) => void,
  ): void;
  removeEventListener?(
    type: "message" | "messageerror",
    cb: (ev: MessageEvent) => void,
  ): void;
  start?(): void;
  close?(): void;
}

/** Tab → follower. */
export type PortRequest =
  | { readonly id: number; readonly op: "open"; readonly name: string; readonly url: string; readonly schema?: readonly unknown[]; readonly token?: string }
  | { readonly id: number; readonly op: "auth"; readonly token: string }
  | { readonly id: number; readonly op: "ready" }
  | { readonly id: number; readonly op: "transact"; readonly tx: readonly unknown[] }
  | { readonly id: number; readonly op: "q"; readonly body: Record<string, unknown> }
  | { readonly id: number; readonly op: "pull"; readonly body: Record<string, unknown> }
  | { readonly id: number; readonly op: "subscribe"; readonly subId: string; readonly kind: "q" | "pull"; readonly body: Record<string, unknown> }
  | { readonly id: number; readonly op: "unsubscribe"; readonly subId: string }
  | { readonly id: number; readonly op: "flush" }
  | { readonly id: number; readonly op: "close" };

/** Follower → tab. */
export type PortEvent =
  | { readonly id: number; readonly op: "reply"; readonly ok: true; readonly body: unknown }
  | { readonly id: number; readonly op: "reply"; readonly ok: false; readonly error: EncodedError }
  | { readonly op: "rows"; readonly subId: string; readonly rows: unknown; readonly epoch: number }
  | { readonly op: "change"; readonly epoch: number };

export interface EncodedError {
  readonly _tag: string;
  readonly message: string;
  readonly code?: string;
  readonly attr?: string;
  readonly clause?: string;
  readonly cells?: number;
  readonly limit?: number;
  readonly retryAfterMs?: number;
}

export const encodeError = (err: DbError): EncodedError => {
  const base: EncodedError = { _tag: err._tag, message: err.message };
  if ("code" in err && typeof err.code === "string") {
    (base as { code: string }).code = err.code;
  }
  if ("attr" in err && typeof err.attr === "string") {
    (base as { attr: string }).attr = err.attr;
  }
  if ("clause" in err && typeof err.clause === "string") {
    (base as { clause: string }).clause = err.clause;
  }
  if ("cells" in err && typeof err.cells === "number") {
    (base as { cells: number }).cells = err.cells;
  }
  if ("limit" in err && typeof err.limit === "number") {
    (base as { limit: number }).limit = err.limit;
  }
  if ("retryAfterMs" in err && typeof err.retryAfterMs === "number") {
    (base as { retryAfterMs: number }).retryAfterMs = err.retryAfterMs;
  }
  return base;
};

export const decodeError = (raw: EncodedError): DbError => {
  const message = raw.message;
  switch (raw._tag) {
    case "TxRejected":
      return new TxRejected({ message, code: raw.code ?? "tx/rejected" });
    case "Unavailable":
      return new Unavailable({ message, retryAfterMs: raw.retryAfterMs ?? 0 });
    case "InvalidRequest":
      return new InvalidRequest({ message });
    case "DatabaseNotFound":
      return new DatabaseNotFound({ message });
    case "Unauthorized":
      return new Unauthorized({
        message,
        ...(raw.code !== undefined ? { code: raw.code } : {}),
        ...(raw.attr !== undefined ? { attr: raw.attr } : {}),
      });
    case "QueryBudgetExceeded":
      return new QueryBudgetExceeded({
        message,
        code: raw.code ?? "query/budget-exceeded",
        clause: raw.clause ?? "",
        cells: raw.cells ?? 0,
        limit: raw.limit ?? 0,
      });
    case "NetworkError":
      return new NetworkError({ message });
    default:
      return new InternalError({ message });
  }
};

export const asPortRequest = (value: unknown): PortRequest | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const o = value as Record<string, unknown>;
  if (typeof o.id !== "number" || typeof o.op !== "string") return undefined;
  return value as PortRequest;
};

export const asPortEvent = (value: unknown): PortEvent | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const o = value as Record<string, unknown>;
  if (typeof o.op !== "string") return undefined;
  return value as PortEvent;
};

export const classifyPort = (err: unknown): DbError =>
  isDatabaseError(err)
    ? err
    : new InternalError({
        message: err instanceof Error ? err.message : String(err),
      });
