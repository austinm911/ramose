/**
 * Client error type. Lives in its own module so `write-ws.ts` can construct one
 * without importing `index.ts` at runtime (which imports `write-ws.ts` back).
 * Re-exported from `index.ts` — `import { RippleError } from "@ripple/client"` still works.
 */
export class RippleError extends Error {
  constructor(
    msg: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(msg);
    this.name = "RippleError";
  }
}
