/** Ensure-schema failure on `create` / `connect`, next to `BadRequest`. */

import * as Data from "effect/Data";

export class SchemaEnsureError extends Data.TaggedError("SchemaEnsureError")<{
  readonly message: string;
  readonly ident?: string;
  readonly cause?: unknown;
}> {}
