import * as Schema from "effect/Schema";
import { type ResolvedTraitBinding } from "./Binding.ts";
import { type CreationDefault, type CreationDefaultContext, type CreationDefaultInputs } from "./Field.ts";
import type { AnyEntity } from "./Entity.ts";
import { type ComposerLike } from "./compose.ts";
export declare class BindingConflictError extends Error {
    readonly name = "BindingConflictError";
}
export declare class CreationValueError extends Error {
    readonly name = "CreationValueError";
}
export interface ResolvedBindingUse {
    readonly binding: ResolvedTraitBinding;
    readonly path: readonly string[];
}
type FixedEntry = {
    readonly key: string;
    readonly ident: string;
    readonly value: unknown;
    readonly path: readonly string[];
};
type DefaultEntry = {
    readonly key: string;
    readonly ident: string;
    readonly get: (context: CreationDefaultContext) => unknown;
    readonly path: readonly string[];
};
type CreationFieldEncoder = (value: unknown) => unknown;
type CreationFieldCodec = {
    readonly encode: CreationFieldEncoder;
    readonly projection: Schema.Json;
};
export interface CompositionValueMetadata {
    readonly bindings: readonly ResolvedBindingUse[];
    readonly fixed: ReadonlyMap<string, FixedEntry>;
    readonly defaults: ReadonlyMap<string, readonly DefaultEntry[]>;
    readonly encoders: ReadonlyMap<string, CreationFieldCodec>;
}
export type CompiledCreationDefault = {
    readonly id: string;
    readonly artifactHash: string;
    readonly revision: {
        readonly _tag: "artifact";
    } | {
        readonly _tag: "declared-inputs";
        readonly inputs: CreationDefaultInputs;
    };
    readonly path: readonly string[];
};
export type DeployedCreationDefaultBinding = CompiledCreationDefault & {
    readonly evaluate: CreationDefault<unknown>;
};
export type CompiledCreationField = {
    readonly key: string;
    readonly ident: string;
    readonly cardinality: "one" | "many";
    readonly optional: boolean;
    readonly encoder: CreationFieldEncoder;
    readonly schemaProjection: Schema.Json;
    readonly fixed: unknown | undefined;
    readonly defaults: readonly CompiledCreationDefault[];
    readonly fieldDefault: CompiledCreationDefault | undefined;
};
export type CompiledBindingIdentity = {
    readonly trait: string;
    readonly definition: string;
    readonly dependencies: readonly string[];
};
export type CompiledCreationPlan = {
    readonly entity: string;
    readonly fields: readonly CompiledCreationField[];
    readonly bindings: readonly CompiledBindingIdentity[];
};
export type CompiledCreationPlanSnapshot = {
    readonly plan: CompiledCreationPlan;
    readonly defaults: readonly DeployedCreationDefaultBinding[];
};
export type PairedCreationDefaults = {
    readonly require: (descriptor: CompiledCreationDefault) => CreationDefault<unknown>;
};
export type CompiledCreationOptions = {
    readonly deferredReferenceKeys?: ReadonlySet<string>;
};
export declare const bindingUsesOf: (composer: ComposerLike) => readonly ResolvedBindingUse[];
/**
 * Resolve fixed/default metadata and reject conflicting reachable bindings.
 * Maps are keyed by stable field ident, not binding-wrapper identity.
 */
export declare const compositionValueMetadata: (entity: AnyEntity) => CompositionValueMetadata;
export declare const compositionValueMetadataFromBindings: (entity: AnyEntity, bindings: readonly ResolvedBindingUse[]) => CompositionValueMetadata;
export declare const compileCreationPlan: (entity: AnyEntity, metadata: CompositionValueMetadata, artifactHash: string) => CompiledCreationPlanSnapshot;
export declare const pairDeployedCreationDefaults: (plans: readonly CompiledCreationPlan[], bindings: readonly DeployedCreationDefaultBinding[]) => PairedCreationDefaults;
export declare const resolveCompiledCreationValues: (plan: CompiledCreationPlan, input: Readonly<Record<string, unknown>>, context: CreationDefaultContext, deployedDefaults: PairedCreationDefaults, options?: CompiledCreationOptions) => Readonly<Record<string, unknown>>;
/** Reject any caller-owned occurrence of a fixed key, including `undefined`. */
export declare const assertNoFixedValues: (entity: AnyEntity, input: Readonly<Record<string, unknown>>) => void;
/**
 * Resolve one creation row with exact precedence:
 * explicit (except `undefined`) → composition default → field default →
 * optional/many omission → required failure. Fixed values are engine-owned.
 */
export declare const resolveCreationValues: (entity: AnyEntity, input: Readonly<Record<string, unknown>>, context: CreationDefaultContext, metadata?: CompositionValueMetadata) => Readonly<Record<string, unknown>>;
export {};
//# sourceMappingURL=creation.d.ts.map