/** Schema-layer tagged failures (`SchemaEnsureError`, `PolicyError`, `MissingPeer`). */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

export class SchemaEnsureError extends Data.TaggedError("SchemaEnsureError")<{
  readonly message: string;
  readonly ident?: string;
  readonly cause?: unknown;
}> {}

/**
 * A policy did not compile against its catalog — an ident the schema does not
 * declare, a rule past the depth bound, a read-masked attribute a pull pattern
 * requires. Deploy/compile time only; a policy never throws into a query.
 */
export class PolicyError extends Data.TaggedError("PolicyError")<{
  readonly message: string;
  /** The attribute or namespace ident the rule named, when there is one. */
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
