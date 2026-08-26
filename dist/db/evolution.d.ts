/**
 * Schema-evolution check for `install()`.
 *
 * `schemaTx` is an unconditional upsert; the peer's rebuild accepts the last
 * datom. This module diffs the desired catalog against the installed
 * attribute set and names the flips that would split the data model.
 */
import type { SchemaAttrTx } from "./ensure.ts";
import type { InstallOptions, SchemaChange } from "./SchemaErrors.ts";
import { IncompatibleSchema } from "./SchemaErrors.ts";
/** One installed attribute, as `install()` reads it back from the peer. */
export interface InstalledAttr {
    /** Attribute entity id, when the catalog read resolved one. */
    readonly e?: number;
    readonly ident: string;
    readonly valueType: string;
    readonly cardinality: string;
    readonly unique?: string;
    readonly optional?: boolean;
}
/** Retract `:db/optional` so an optional→required flip actually applies. */
export type OptionalRetract = readonly [
    ":db/retract",
    number | readonly [":db/ident", string],
    ":db/optional",
    true
];
export declare const isSystemIdent: (ident: string) => boolean;
/** `:user/name` → `user`. */
export declare const namespaceOf: (ident: string) => string;
export declare const isRequiredAttr: (attr: {
    readonly cardinality: string;
    readonly optional?: boolean;
}) => boolean;
/** Every attribute entity: ident + valueType + cardinality. */
export declare const installedCoreQuery: import("./index.ts").QueryObject<import("./query/kernel.ts").RecordRow<{
    e: import("./query/kernel.ts").Var<import("./query/kernel.ts").EidCell, import("./Entity.ts").AnyEntity>;
    ident: import("./query/kernel.ts").Var<unknown, import("./Entity.ts").AnyEntity>;
    valueType: import("./query/kernel.ts").Var<unknown, import("./Entity.ts").AnyEntity>;
    cardinality: import("./query/kernel.ts").Var<unknown, import("./Entity.ts").AnyEntity>;
}>, readonly import("./query/kernel.ts").RecordRow<{
    e: import("./query/kernel.ts").Var<import("./query/kernel.ts").EidCell, import("./Entity.ts").AnyEntity>;
    ident: import("./query/kernel.ts").Var<unknown, import("./Entity.ts").AnyEntity>;
    valueType: import("./query/kernel.ts").Var<unknown, import("./Entity.ts").AnyEntity>;
    cardinality: import("./query/kernel.ts").Var<unknown, import("./Entity.ts").AnyEntity>;
}>[], "rows">;
export declare const installedUniqueQuery: import("./index.ts").QueryObject<import("./query/kernel.ts").RecordRow<{
    e: import("./query/kernel.ts").Var<import("./query/kernel.ts").EidCell, import("./Entity.ts").AnyEntity>;
    unique: import("./query/kernel.ts").Var<unknown, import("./Entity.ts").AnyEntity>;
}>, readonly import("./query/kernel.ts").RecordRow<{
    e: import("./query/kernel.ts").Var<import("./query/kernel.ts").EidCell, import("./Entity.ts").AnyEntity>;
    unique: import("./query/kernel.ts").Var<unknown, import("./Entity.ts").AnyEntity>;
}>[], "rows">;
export declare const installedOptionalQuery: import("./index.ts").QueryObject<import("./query/kernel.ts").RecordRow<{
    e: import("./query/kernel.ts").Var<import("./query/kernel.ts").EidCell, import("./Entity.ts").AnyEntity>;
    optional: import("./query/kernel.ts").Var<unknown, import("./Entity.ts").AnyEntity>;
}>, readonly import("./query/kernel.ts").RecordRow<{
    e: import("./query/kernel.ts").Var<import("./query/kernel.ts").EidCell, import("./Entity.ts").AnyEntity>;
    optional: import("./query/kernel.ts").Var<unknown, import("./Entity.ts").AnyEntity>;
}>[], "rows">;
/**
 * Any entity that asserts one of `idents`. `.one()` so occupancy is a
 * single row or `null`.
 */
export declare const occupancyQuery: (idents: readonly string[]) => import("./index.ts").QueryObject<{
    readonly id: number;
}, {
    readonly id: number;
} | null, "one">;
export interface InstalledCoreRow {
    readonly e: unknown;
    readonly ident: unknown;
    readonly valueType: unknown;
    readonly cardinality: unknown;
}
export interface InstalledUniqueRow {
    readonly e: unknown;
    readonly unique: unknown;
}
export interface InstalledOptionalRow {
    readonly e: unknown;
    readonly optional: unknown;
}
/** Join the three catalog queries into one installed-attribute list. */
export declare const assembleInstalled: (core: readonly InstalledCoreRow[], uniques: readonly InstalledUniqueRow[], optionals: readonly InstalledOptionalRow[]) => InstalledAttr[];
/**
 * Namespaces that already have attributes installed — those are the ones
 * a new required field would land on existing rows of.
 */
export declare const installedNamespaces: (installed: readonly InstalledAttr[]) => ReadonlySet<string>;
/** Existing idents in `ns`, card-one first so occupancy prefers required keys. */
export declare const occupancyIdents: (installed: readonly InstalledAttr[], ns: string) => string[];
export declare const incompatibleMessage: (changes: readonly SchemaChange[]) => string;
/**
 * Diff the desired catalog against the installed attribute set.
 *
 * `occupied` is the set of namespaces that already have at least one
 * entity. A new required field (or an optional→required flip) on an
 * occupied namespace is incompatible.
 */
export declare const checkEvolution: (desiredTx: readonly SchemaAttrTx[], installed: readonly InstalledAttr[], occupied: ReadonlySet<string>, options?: InstallOptions) => IncompatibleSchema | undefined;
/**
 * Namespaces that still need an occupancy read: a new required field, or
 * an optional→required flip, not covered by the hatch.
 */
export declare const namespacesNeedingOccupancy: (desiredTx: readonly SchemaAttrTx[], installed: readonly InstalledAttr[], options?: InstallOptions) => readonly string[];
/**
 * Retracts for installed-optional / desired-required attrs. `attributeTx`
 * never retracts `:db/optional`; without these ops the flip is a no-op.
 */
export declare const optionalRetracts: (desiredTx: readonly SchemaAttrTx[], installed: readonly InstalledAttr[]) => readonly OptionalRetract[];
/** Catalog upsert plus the retracts that make optional→required real. */
export declare const installTx: (desiredTx: readonly SchemaAttrTx[], installed: readonly InstalledAttr[]) => readonly unknown[];
//# sourceMappingURL=evolution.d.ts.map