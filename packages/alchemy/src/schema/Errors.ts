/**
 * Ensure-schema failure. Lives on `create` / `connect`'s error channel
 * next to `BadRequest` (invalid database name).
 *
 * A real implementation would transact the catalog's ident datoms as their
 * own schema tx and map a rejected / network failure onto this tag. This
 * proposal only puts the tag on the Effect so `catchTags` typechecks.
 */

import * as Data from "effect/Data";

export class SchemaEnsureError extends Data.TaggedError("SchemaEnsureError")<{
  readonly message: string;
  readonly ident?: string;
  readonly cause?: unknown;
}> {}
