/** Schema-layer tagged failures: a policy that did not compile, or
 * `install()` refused a data-model split. Lives here so the client `.d.ts`
 * hop is the allowlisted `Errors` module — not a new Effect import. */
import * as Data from "effect/Data";
/**
 * A policy did not compile against its catalog — an ident the schema does not
 * declare, a rule body the query validator rejects, a read-masked attribute a
 * pull pattern requires. Deploy/compile time only; a policy never throws into a
 * query.
 *
 * Provisioning mistakes elsewhere are defects, not failures: a malformed URL,
 * a missing binding, a `db.install()` that cannot reach the peer all surface
 * as `Effect.die` or one of the nine `DbError`s.
 */
export class PolicyError extends Data.TaggedError("PolicyError") {
}
/**
 * `install()` refused a change that would split the data model. Not a
 * {@link import("./Errors.ts").DbError} — the write never left the client.
 * Match with `instanceof` or `_tag`.
 */
export class IncompatibleSchema extends Data.TaggedError("IncompatibleSchema") {
}
//# sourceMappingURL=SchemaErrors.js.map