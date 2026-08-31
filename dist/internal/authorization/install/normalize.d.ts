import * as Result from "effect/Result";
import { EntityDescriptor, FieldDescriptor, TraitComposition, TraitDescriptor, type CatalogDescriptor, type RuleAccessPlan } from "../catalog.ts";
import type { CanonicalAuthorizationDecisions, CanonicalAuthorizationRule, ValidatedAuthorizationIR } from "../ir.ts";
import type { ClaimDescriptor } from "../principal.ts";
import { type ValidateFailure } from "../validation/common.ts";
export declare const normalizeClasses: (classes: ReadonlyArray<string>) => Result.Result<ReadonlyArray<string>, ValidateFailure>;
export declare const normalizeClaims: (claims: ReadonlyArray<ClaimDescriptor>) => Result.Result<ReadonlyArray<ClaimDescriptor>, ValidateFailure>;
export declare const normalizeEntities: (entities: ReadonlyArray<EntityDescriptor>) => Result.Result<ReadonlyArray<EntityDescriptor>, ValidateFailure>;
export declare const normalizeTraits: (traits: ReadonlyArray<TraitDescriptor>) => Result.Result<ReadonlyArray<TraitDescriptor>, ValidateFailure>;
export declare const normalizeFields: (fields: ReadonlyArray<FieldDescriptor>) => Result.Result<ReadonlyArray<FieldDescriptor>, ValidateFailure>;
export declare const normalizeTraitComposition: (rows: ReadonlyArray<TraitComposition>) => Result.Result<ReadonlyArray<TraitComposition>, ValidateFailure>;
export declare const normalizeOperations: (operations: CatalogDescriptor["operations"]) => Result.Result<ReadonlyArray<CatalogDescriptor["operations"][number]>, ValidateFailure>;
export declare const normalizeRules: (rules: ReadonlyArray<CanonicalAuthorizationRule>) => Result.Result<ReadonlyArray<CanonicalAuthorizationRule>, ValidateFailure>;
export declare const normalizeDecisions: (decisions: CanonicalAuthorizationDecisions) => Result.Result<CanonicalAuthorizationDecisions, ValidateFailure>;
export declare const normalizeAccessPlans: (plans: ReadonlyArray<RuleAccessPlan>, rules: ReadonlyArray<CanonicalAuthorizationRule>) => Result.Result<ReadonlyArray<RuleAccessPlan>, ValidateFailure>;
export declare const normalizeValidatedTables: (validated: ValidatedAuthorizationIR, plans: ReadonlyArray<RuleAccessPlan>) => Result.Result<{
    classes: readonly string[];
    claims: readonly {
        readonly key: string;
        readonly optional: boolean;
        readonly shape: {
            readonly _tag: "scalar";
            readonly valueType: "boolean" | "double" | "long" | "string";
        } | {
            readonly _tag: "array";
            readonly items: {
                readonly _tag: "scalar";
                readonly valueType: "boolean" | "double" | "long" | "string";
            };
        };
    }[];
    rules: readonly {
        readonly id: string & import("effect/Brand").Brand<"RuleId">;
        readonly focus: {
            readonly _tag: "entity";
            readonly entity: {
                readonly _tag: "EntityId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly name: string;
            };
        } | {
            readonly _tag: "trait";
            readonly trait: {
                readonly _tag: "TraitId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly name: string;
            };
        } | {
            readonly _tag: "field";
            readonly field: {
                readonly _tag: "FieldId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly owner: {
                    readonly kind: "entity" | "trait";
                    readonly name: string;
                };
                readonly localName: string;
            };
        } | {
            readonly _tag: "operation";
            readonly operation: {
                readonly _tag: "OperationId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly owner: {
                    readonly kind: "entity" | "trait";
                    readonly name: string;
                };
                readonly localName: string;
                readonly target: "none" | "required";
            };
        };
        readonly expr: import("../expr.ts").CanonicalAuthorizationExpr;
        readonly usesResource: boolean;
        readonly usesMe: boolean;
        readonly usesSubject: boolean;
        readonly traversalDepth: number;
    }[];
    decisions: {
        readonly entities: readonly {
            readonly target: {
                readonly _tag: "EntityId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly name: string;
            };
            readonly decision: {
                readonly allow: readonly (string & import("effect/Brand").Brand<"RuleId">)[];
                readonly deny: readonly (string & import("effect/Brand").Brand<"RuleId">)[];
            };
        }[];
        readonly traits: readonly {
            readonly target: {
                readonly _tag: "TraitId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly name: string;
            };
            readonly decision: {
                readonly allow: readonly (string & import("effect/Brand").Brand<"RuleId">)[];
                readonly deny: readonly (string & import("effect/Brand").Brand<"RuleId">)[];
            };
        }[];
        readonly fields: readonly {
            readonly target: {
                readonly _tag: "FieldId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly owner: {
                    readonly kind: "entity" | "trait";
                    readonly name: string;
                };
                readonly localName: string;
            };
            readonly decision: {
                readonly allow: readonly (string & import("effect/Brand").Brand<"RuleId">)[];
                readonly deny: readonly (string & import("effect/Brand").Brand<"RuleId">)[];
            };
        }[];
        readonly operations: readonly {
            readonly target: {
                readonly _tag: "OperationId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly owner: {
                    readonly kind: "entity" | "trait";
                    readonly name: string;
                };
                readonly localName: string;
                readonly target: "none" | "required";
            };
            readonly decision: {
                readonly allow: readonly (string & import("effect/Brand").Brand<"RuleId">)[];
                readonly deny: readonly (string & import("effect/Brand").Brand<"RuleId">)[];
            };
        }[];
    };
    accessPlans: readonly {
        readonly rule: string & import("effect/Brand").Brand<"RuleId">;
        readonly lookups: readonly ({
            readonly _tag: "field";
            readonly field: {
                readonly _tag: "FieldId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly owner: {
                    readonly kind: "entity" | "trait";
                    readonly name: string;
                };
                readonly localName: string;
            };
        } | {
            readonly _tag: "entity";
            readonly entity: {
                readonly _tag: "EntityId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly name: string;
            };
        } | {
            readonly _tag: "trait";
            readonly trait: {
                readonly _tag: "TraitId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly name: string;
            };
        } | {
            readonly _tag: "index";
            readonly field: {
                readonly _tag: "FieldId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly owner: {
                    readonly kind: "entity" | "trait";
                    readonly name: string;
                };
                readonly localName: string;
            };
        } | {
            readonly _tag: "refIndex";
            readonly field: {
                readonly _tag: "FieldId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly owner: {
                    readonly kind: "entity" | "trait";
                    readonly name: string;
                };
                readonly localName: string;
            };
        } | {
            readonly _tag: "principal";
            readonly field: {
                readonly _tag: "FieldId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly owner: {
                    readonly kind: "entity" | "trait";
                    readonly name: string;
                };
                readonly localName: string;
            };
        })[];
    }[];
}, ValidateFailure>;
//# sourceMappingURL=normalize.d.ts.map