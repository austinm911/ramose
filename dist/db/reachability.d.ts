import { type CodeDefinition, type CodeDefinitionRef, type ResolvedTraitBinding } from "./Binding.ts";
import type { AnyEntity } from "./Entity.ts";
import type { CompositionValueMetadata } from "./creation.ts";
export declare class ReachabilityConflictError extends Error {
    readonly name = "ReachabilityConflictError";
}
export interface ReachableCodeDefinition {
    readonly key: string;
    readonly definition: CodeDefinition;
    readonly path: readonly string[];
}
export interface ReachableBinding {
    readonly catalogKey: string;
    readonly entity: string;
    readonly binding: ResolvedTraitBinding;
    readonly path: readonly string[];
}
export interface CodeReachability {
    readonly root: CodeDefinition;
    readonly definitions: readonly ReachableCodeDefinition[];
    readonly bindings: readonly ReachableBinding[];
    readonly creation: readonly ReachableCreationMetadata[];
}
export interface ReachableCreationMetadata {
    readonly catalogKey: string;
    readonly entity: string;
    readonly metadata: CompositionValueMetadata;
}
type ReachableEntity = {
    readonly entity: AnyEntity;
    readonly path: readonly string[];
};
export declare const collectDefinitionEntities: (definition: CodeDefinition) => readonly ReachableEntity[];
/**
 * Walk root catalog → schema → entities → operations/writes → traits →
 * bindings → dependencies.
 * Definitions are marked by permanent key before descending, so recursive
 * graphs terminate. The result is inert authoring metadata, not a registry.
 */
export declare const collectCodeReachability: (rootRef: CodeDefinitionRef) => CodeReachability;
export {};
//# sourceMappingURL=reachability.d.ts.map