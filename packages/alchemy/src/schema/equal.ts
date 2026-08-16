/**
 * Compile-time equality. A fixture that writes `Expect<Equal<A, B>>` fails
 * `tsc` when A and B are not the same type — that is the regression tripwire
 * for this proposal.
 *
 * This module is a *new typed layer* on top of today's untyped
 * `ReadWriteDatabaseClient`. It does not rewrite the transactor, the worker,
 * or the existing client runtime.
 */

export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

export type Expect<T extends true> = T;

/** `true` when `A` is assignable to `B`. */
export type Extends<A, B> = [A] extends [B] ? true : false;
