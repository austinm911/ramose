/** Schema-layer tagged failures (`SchemaEnsureError`, `MissingPeer`). */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

export class SchemaEnsureError extends Data.TaggedError("SchemaEnsureError")<{
  readonly message: string;
  readonly ident?: string;
  readonly cause?: unknown;
}> {}

/** I/O was called on a typed helper that was not given a peer. */
export class MissingPeer extends Data.TaggedError("MissingPeer")<{
  readonly message: string;
  readonly what: string;
}> {}

export const missingPeer = (what: string): MissingPeer =>
  new MissingPeer({
    message: `ripple/schema: ${what} requires a peer`,
    what,
  });

export const noPeer = <A = never, R = never>(
  what: string,
): Effect.Effect<A, MissingPeer, R> => Effect.fail(missingPeer(what));
