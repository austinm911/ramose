/** Schema-layer tagged failures: a policy that did not compile, or
 * `install()` refused a data-model split. Lives here so the client `.d.ts`
 * hop is the allowlisted `Errors` module — not a new Effect import. */
declare const PolicyError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "PolicyError";
} & Readonly<A>;
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
export declare class PolicyError extends PolicyError_base<{
    readonly message: string;
    /** The attribute or namespace ident the rule named, when there is one. */
    readonly ident?: string;
    readonly cause?: unknown;
}> {
}
/** Opt-in listed on `db.install({ allowIncompatible })`. */
export interface InstallOptions {
    /**
     * Idents (`:todo/title`) whose incompatible flips — value type,
     * cardinality, uniqueness, or a new required field on existing rows —
     * are applied anyway. Unlisted idents still fail the check.
     */
    readonly allowIncompatible?: readonly string[];
}
export type IncompatibleKind = "valueType" | "cardinality" | "unique" | "required";
export interface SchemaChange {
    readonly ident: string;
    readonly kind: IncompatibleKind;
    /** Installed wire value; absent on a new required field. */
    readonly from?: string;
    /** Desired wire value; absent on a new required field. */
    readonly to?: string;
}
declare const IncompatibleSchema_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "IncompatibleSchema";
} & Readonly<A>;
/**
 * `install()` refused a change that would split the data model. Not a
 * {@link import("./Errors.ts").DbError} — the write never left the client.
 * Match with `instanceof` or `_tag`.
 */
export declare class IncompatibleSchema extends IncompatibleSchema_base<{
    readonly message: string;
    readonly changes: readonly SchemaChange[];
}> {
}
export {};
//# sourceMappingURL=SchemaErrors.d.ts.map