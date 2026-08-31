import * as Brand from "effect/Brand";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { OperationInputShape, type CatalogDescriptor as CatalogDescriptorType } from "./catalog.ts";
import { CatalogUnitCorrupt } from "./failures.ts";
import { type InstalledAuthorizationIR as InstalledAuthorizationIRType, type InstalledAuthorizationIRV2 as InstalledAuthorizationIRV2Type } from "./ir.ts";
import { type ValidateFailure } from "./validation/common.ts";
export declare const INSTALLED_CATALOG_UNIT_VERSION: 2;
export declare const InstalledCatalogUnitVersion: Schema.Literal<2>;
export type InstalledCatalogUnitVersion = typeof InstalledCatalogUnitVersion.Type;
export declare const InstalledCatalogUnit: Schema.TaggedStruct<"InstalledCatalogUnit", {
    readonly version: Schema.Literal<2>;
    readonly catalog: Schema.Struct<{
        readonly id: Schema.brand<Schema.String, "CatalogId">;
        readonly database: Schema.brand<Schema.String, "DatabaseId">;
        readonly version: Schema.brand<Schema.String, "CatalogVersion">;
        readonly fingerprint: Schema.brand<Schema.String, "SchemaFingerprint">;
        readonly entities: Schema.$Array<Schema.Struct<{
            readonly id: Schema.TaggedStruct<"EntityId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly name: Schema.String;
            }>;
            readonly traits: Schema.$Array<Schema.TaggedStruct<"TraitId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly name: Schema.String;
            }>>;
            readonly doc: Schema.optionalKey<Schema.String>;
        }>>;
        readonly traits: Schema.$Array<Schema.Struct<{
            readonly id: Schema.TaggedStruct<"TraitId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly name: Schema.String;
            }>;
            readonly traits: Schema.$Array<Schema.TaggedStruct<"TraitId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly name: Schema.String;
            }>>;
            readonly doc: Schema.optionalKey<Schema.String>;
        }>>;
        readonly fields: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
            readonly id: Schema.TaggedStruct<"FieldId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly owner: Schema.Struct<{
                    readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                    readonly name: Schema.String;
                }>;
                readonly localName: Schema.String;
            }>;
            readonly cardinality: Schema.Literals<readonly ["one", "many"]>;
            readonly unique: Schema.optionalKey<Schema.Literals<readonly ["upsert", "strict"]>>;
            readonly index: Schema.Boolean;
            readonly optional: Schema.Boolean;
            readonly owned: Schema.Boolean;
            readonly doc: Schema.optionalKey<Schema.String>;
            readonly valueType: Schema.Literals<readonly ["string", "long", "double", "boolean", "uuid", "instant", "bytes"]>;
        }>, Schema.Struct<{
            readonly id: Schema.TaggedStruct<"FieldId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly owner: Schema.Struct<{
                    readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                    readonly name: Schema.String;
                }>;
                readonly localName: Schema.String;
            }>;
            readonly cardinality: Schema.Literals<readonly ["one", "many"]>;
            readonly unique: Schema.optionalKey<Schema.Literals<readonly ["upsert", "strict"]>>;
            readonly index: Schema.Boolean;
            readonly optional: Schema.Boolean;
            readonly owned: Schema.Boolean;
            readonly doc: Schema.optionalKey<Schema.String>;
            readonly valueType: Schema.Literal<"ref">;
            readonly refTarget: Schema.Union<readonly [Schema.TaggedStruct<"entity", {
                readonly entity: Schema.TaggedStruct<"EntityId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly name: Schema.String;
                }>;
            }>, Schema.TaggedStruct<"trait", {
                readonly trait: Schema.TaggedStruct<"TraitId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly name: Schema.String;
                }>;
            }>, Schema.TaggedStruct<"self", {}>, Schema.TaggedStruct<"untargeted", {}>]>;
        }>]>>;
        readonly operations: Schema.$Array<Schema.Struct<{
            readonly id: Schema.TaggedStruct<"OperationId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly owner: Schema.Struct<{
                    readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                    readonly name: Schema.String;
                }>;
                readonly localName: Schema.String;
                readonly target: Schema.Literals<readonly ["required", "none"]>;
            }>;
            readonly input: Schema.Codec<OperationInputShape, import("./catalog.ts").OperationInputShapeEncoded, never, never>;
            readonly output: Schema.Codec<OperationInputShape, import("./catalog.ts").OperationInputShapeEncoded, never, never>;
            readonly version: Schema.brand<Schema.String, "OperationVersion">;
            readonly revision: Schema.Int;
            readonly inputSchemaHash: Schema.String;
            readonly outputSchemaHash: Schema.String;
            readonly bodyHash: Schema.String;
            readonly composers: Schema.$Array<Schema.TaggedStruct<"EntityId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly name: Schema.String;
            }>>;
            readonly writes: Schema.$Array<Schema.TaggedStruct<"EntityId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly name: Schema.String;
            }>>;
            readonly allocations: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly slot: Schema.String;
                readonly path: Schema.$Array<Schema.Union<readonly [Schema.String, Schema.Int]>>;
            }>>>;
            readonly doc: Schema.optionalKey<Schema.String>;
        }>>;
        readonly traitComposition: Schema.$Array<Schema.Struct<{
            readonly composer: Schema.TaggedStruct<"EntityId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly name: Schema.String;
            }>;
            readonly trait: Schema.TaggedStruct<"TraitId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly name: Schema.String;
            }>;
            readonly transitive: Schema.$Array<Schema.TaggedStruct<"TraitId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly name: Schema.String;
            }>>;
        }>>;
    }>;
    readonly policy: Schema.TaggedStruct<"InstalledAuthorizationIR", {
        readonly version: Schema.Literal<2>;
        readonly languageVersion: Schema.Literal<"v1">;
        readonly policyHash: Schema.brand<Schema.String, "PolicyHash">;
        readonly classes: Schema.$Array<Schema.String>;
        readonly claims: Schema.$Array<Schema.Struct<{
            readonly key: Schema.String;
            readonly optional: Schema.Boolean;
            readonly shape: Schema.Union<readonly [Schema.TaggedStruct<"scalar", {
                readonly valueType: Schema.Literals<readonly ["string", "long", "double", "boolean"]>;
            }>, Schema.TaggedStruct<"array", {
                readonly items: Schema.TaggedStruct<"scalar", {
                    readonly valueType: Schema.Literals<readonly ["string", "long", "double", "boolean"]>;
                }>;
            }>]>;
        }>>;
        readonly principal: Schema.Struct<{
            readonly subjectClaim: Schema.String;
            readonly entity: Schema.optionalKey<Schema.TaggedStruct<"FieldId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly owner: Schema.Struct<{
                    readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                    readonly name: Schema.String;
                }>;
                readonly localName: Schema.String;
            }>>;
        }>;
        readonly rules: Schema.$Array<Schema.Struct<{
            readonly id: Schema.brand<Schema.String, "RuleId">;
            readonly focus: Schema.Union<readonly [Schema.TaggedStruct<"entity", {
                readonly entity: Schema.TaggedStruct<"EntityId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly name: Schema.String;
                }>;
            }>, Schema.TaggedStruct<"trait", {
                readonly trait: Schema.TaggedStruct<"TraitId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly name: Schema.String;
                }>;
            }>, Schema.TaggedStruct<"field", {
                readonly field: Schema.TaggedStruct<"FieldId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly owner: Schema.Struct<{
                        readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                        readonly name: Schema.String;
                    }>;
                    readonly localName: Schema.String;
                }>;
            }>, Schema.TaggedStruct<"operation", {
                readonly operation: Schema.TaggedStruct<"OperationId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly owner: Schema.Struct<{
                        readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                        readonly name: Schema.String;
                    }>;
                    readonly localName: Schema.String;
                    readonly target: Schema.Literals<readonly ["required", "none"]>;
                }>;
            }>]>;
            readonly expr: Schema.Codec<import("./expr.ts").CanonicalAuthorizationExpr, import("./expr.ts").CanonicalAuthorizationExprEncoded, never, never>;
            readonly usesResource: Schema.Boolean;
            readonly usesMe: Schema.Boolean;
            readonly usesSubject: Schema.Boolean;
            readonly traversalDepth: Schema.Natural;
        }>>;
        readonly decisions: Schema.Struct<{
            readonly entities: Schema.$Array<Schema.Struct<{
                readonly target: Schema.TaggedStruct<"EntityId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly name: Schema.String;
                }>;
                readonly decision: Schema.Struct<{
                    readonly allow: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
                    readonly deny: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
                }>;
            }>>;
            readonly traits: Schema.$Array<Schema.Struct<{
                readonly target: Schema.TaggedStruct<"TraitId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly name: Schema.String;
                }>;
                readonly decision: Schema.Struct<{
                    readonly allow: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
                    readonly deny: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
                }>;
            }>>;
            readonly fields: Schema.$Array<Schema.Struct<{
                readonly target: Schema.TaggedStruct<"FieldId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly owner: Schema.Struct<{
                        readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                        readonly name: Schema.String;
                    }>;
                    readonly localName: Schema.String;
                }>;
                readonly decision: Schema.Struct<{
                    readonly allow: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
                    readonly deny: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
                }>;
            }>>;
            readonly operations: Schema.$Array<Schema.Struct<{
                readonly target: Schema.TaggedStruct<"OperationId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly owner: Schema.Struct<{
                        readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                        readonly name: Schema.String;
                    }>;
                    readonly localName: Schema.String;
                    readonly target: Schema.Literals<readonly ["required", "none"]>;
                }>;
                readonly decision: Schema.Struct<{
                    readonly allow: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
                    readonly deny: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
                }>;
            }>>;
        }>;
        readonly accessPlans: Schema.$Array<Schema.Struct<{
            readonly rule: Schema.brand<Schema.String, "RuleId">;
            readonly lookups: Schema.$Array<Schema.Union<readonly [Schema.TaggedStruct<"field", {
                readonly field: Schema.TaggedStruct<"FieldId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly owner: Schema.Struct<{
                        readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                        readonly name: Schema.String;
                    }>;
                    readonly localName: Schema.String;
                }>;
            }>, Schema.TaggedStruct<"entity", {
                readonly entity: Schema.TaggedStruct<"EntityId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly name: Schema.String;
                }>;
            }>, Schema.TaggedStruct<"trait", {
                readonly trait: Schema.TaggedStruct<"TraitId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly name: Schema.String;
                }>;
            }>, Schema.TaggedStruct<"index", {
                readonly field: Schema.TaggedStruct<"FieldId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly owner: Schema.Struct<{
                        readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                        readonly name: Schema.String;
                    }>;
                    readonly localName: Schema.String;
                }>;
            }>, Schema.TaggedStruct<"refIndex", {
                readonly field: Schema.TaggedStruct<"FieldId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly owner: Schema.Struct<{
                        readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                        readonly name: Schema.String;
                    }>;
                    readonly localName: Schema.String;
                }>;
            }>, Schema.TaggedStruct<"principal", {
                readonly field: Schema.TaggedStruct<"FieldId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly owner: Schema.Struct<{
                        readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                        readonly name: Schema.String;
                    }>;
                    readonly localName: Schema.String;
                }>;
            }>]>>;
        }>>;
    }>;
    readonly unitHash: Schema.brand<Schema.String, "CatalogUnitHash">;
}>;
export type InstalledCatalogUnit = typeof InstalledCatalogUnit.Type;
export declare const LegacyInstalledCatalogUnitV1: Schema.TaggedStruct<"InstalledCatalogUnit", {
    readonly version: Schema.Literal<1>;
    readonly catalog: Schema.Struct<{
        readonly id: Schema.brand<Schema.String, "CatalogId">;
        readonly database: Schema.brand<Schema.String, "DatabaseId">;
        readonly version: Schema.brand<Schema.String, "CatalogVersion">;
        readonly fingerprint: Schema.brand<Schema.String, "SchemaFingerprint">;
        readonly entities: Schema.$Array<Schema.Struct<{
            readonly id: Schema.TaggedStruct<"EntityId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly name: Schema.String;
            }>;
            readonly traits: Schema.$Array<Schema.TaggedStruct<"TraitId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly name: Schema.String;
            }>>;
            readonly doc: Schema.optionalKey<Schema.String>;
        }>>;
        readonly traits: Schema.$Array<Schema.Struct<{
            readonly id: Schema.TaggedStruct<"TraitId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly name: Schema.String;
            }>;
            readonly traits: Schema.$Array<Schema.TaggedStruct<"TraitId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly name: Schema.String;
            }>>;
            readonly doc: Schema.optionalKey<Schema.String>;
        }>>;
        readonly fields: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
            readonly id: Schema.TaggedStruct<"FieldId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly owner: Schema.Struct<{
                    readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                    readonly name: Schema.String;
                }>;
                readonly localName: Schema.String;
            }>;
            readonly cardinality: Schema.Literals<readonly ["one", "many"]>;
            readonly unique: Schema.optionalKey<Schema.Literals<readonly ["upsert", "strict"]>>;
            readonly index: Schema.Boolean;
            readonly optional: Schema.Boolean;
            readonly owned: Schema.Boolean;
            readonly doc: Schema.optionalKey<Schema.String>;
            readonly valueType: Schema.Literals<readonly ["string", "long", "double", "boolean", "uuid", "instant", "bytes"]>;
        }>, Schema.Struct<{
            readonly id: Schema.TaggedStruct<"FieldId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly owner: Schema.Struct<{
                    readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                    readonly name: Schema.String;
                }>;
                readonly localName: Schema.String;
            }>;
            readonly cardinality: Schema.Literals<readonly ["one", "many"]>;
            readonly unique: Schema.optionalKey<Schema.Literals<readonly ["upsert", "strict"]>>;
            readonly index: Schema.Boolean;
            readonly optional: Schema.Boolean;
            readonly owned: Schema.Boolean;
            readonly doc: Schema.optionalKey<Schema.String>;
            readonly valueType: Schema.Literal<"ref">;
            readonly refTarget: Schema.Union<readonly [Schema.TaggedStruct<"entity", {
                readonly entity: Schema.TaggedStruct<"EntityId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly name: Schema.String;
                }>;
            }>, Schema.TaggedStruct<"trait", {
                readonly trait: Schema.TaggedStruct<"TraitId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly name: Schema.String;
                }>;
            }>, Schema.TaggedStruct<"self", {}>, Schema.TaggedStruct<"untargeted", {}>]>;
        }>]>>;
        readonly operations: Schema.$Array<Schema.Struct<{
            readonly id: Schema.TaggedStruct<"OperationId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly owner: Schema.Struct<{
                    readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                    readonly name: Schema.String;
                }>;
                readonly localName: Schema.String;
                readonly target: Schema.Literals<readonly ["required", "none"]>;
            }>;
            readonly input: Schema.Codec<OperationInputShape, import("./catalog.ts").OperationInputShapeEncoded, never, never>;
        }>>;
        readonly traitComposition: Schema.$Array<Schema.Struct<{
            readonly composer: Schema.TaggedStruct<"EntityId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly name: Schema.String;
            }>;
            readonly trait: Schema.TaggedStruct<"TraitId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly name: Schema.String;
            }>;
            readonly transitive: Schema.$Array<Schema.TaggedStruct<"TraitId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly name: Schema.String;
            }>>;
        }>>;
    }>;
    readonly policy: Schema.TaggedStruct<"InstalledAuthorizationIR", {
        readonly version: Schema.Literal<1>;
        readonly languageVersion: Schema.Literal<"v1">;
        readonly policyHash: Schema.brand<Schema.String, "PolicyHash">;
        readonly classes: Schema.$Array<Schema.String>;
        readonly claims: Schema.$Array<Schema.Struct<{
            readonly key: Schema.String;
            readonly optional: Schema.Boolean;
            readonly shape: Schema.Union<readonly [Schema.TaggedStruct<"scalar", {
                readonly valueType: Schema.Literals<readonly ["string", "long", "double", "boolean"]>;
            }>, Schema.TaggedStruct<"array", {
                readonly items: Schema.TaggedStruct<"scalar", {
                    readonly valueType: Schema.Literals<readonly ["string", "long", "double", "boolean"]>;
                }>;
            }>]>;
        }>>;
        readonly principal: Schema.Struct<{
            readonly subjectClaim: Schema.String;
            readonly entity: Schema.optionalKey<Schema.TaggedStruct<"FieldId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly owner: Schema.Struct<{
                    readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                    readonly name: Schema.String;
                }>;
                readonly localName: Schema.String;
            }>>;
        }>;
        readonly rules: Schema.$Array<Schema.Struct<{
            readonly id: Schema.brand<Schema.String, "RuleId">;
            readonly focus: Schema.Union<readonly [Schema.TaggedStruct<"entity", {
                readonly entity: Schema.TaggedStruct<"EntityId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly name: Schema.String;
                }>;
            }>, Schema.TaggedStruct<"trait", {
                readonly trait: Schema.TaggedStruct<"TraitId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly name: Schema.String;
                }>;
            }>, Schema.TaggedStruct<"field", {
                readonly field: Schema.TaggedStruct<"FieldId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly owner: Schema.Struct<{
                        readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                        readonly name: Schema.String;
                    }>;
                    readonly localName: Schema.String;
                }>;
            }>, Schema.TaggedStruct<"operation", {
                readonly operation: Schema.Never;
            }>]>;
            readonly expr: Schema.Codec<import("./expr.ts").CanonicalAuthorizationExpr, import("./expr.ts").CanonicalAuthorizationExprEncoded, never, never>;
            readonly usesResource: Schema.Boolean;
            readonly usesMe: Schema.Boolean;
            readonly usesSubject: Schema.Boolean;
            readonly traversalDepth: Schema.Natural;
        }>>;
        readonly decisions: Schema.Struct<{
            readonly entities: Schema.$Array<Schema.Struct<{
                readonly target: Schema.TaggedStruct<"EntityId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly name: Schema.String;
                }>;
                readonly decision: Schema.Struct<{
                    readonly allow: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
                    readonly deny: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
                }>;
            }>>;
            readonly traits: Schema.$Array<Schema.Struct<{
                readonly target: Schema.TaggedStruct<"TraitId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly name: Schema.String;
                }>;
                readonly decision: Schema.Struct<{
                    readonly allow: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
                    readonly deny: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
                }>;
            }>>;
            readonly fields: Schema.$Array<Schema.Struct<{
                readonly target: Schema.TaggedStruct<"FieldId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly owner: Schema.Struct<{
                        readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                        readonly name: Schema.String;
                    }>;
                    readonly localName: Schema.String;
                }>;
                readonly decision: Schema.Struct<{
                    readonly allow: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
                    readonly deny: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
                }>;
            }>>;
        }>;
        readonly accessPlans: Schema.$Array<Schema.Struct<{
            readonly rule: Schema.brand<Schema.String, "RuleId">;
            readonly lookups: Schema.$Array<Schema.Union<readonly [Schema.TaggedStruct<"field", {
                readonly field: Schema.TaggedStruct<"FieldId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly owner: Schema.Struct<{
                        readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                        readonly name: Schema.String;
                    }>;
                    readonly localName: Schema.String;
                }>;
            }>, Schema.TaggedStruct<"entity", {
                readonly entity: Schema.TaggedStruct<"EntityId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly name: Schema.String;
                }>;
            }>, Schema.TaggedStruct<"trait", {
                readonly trait: Schema.TaggedStruct<"TraitId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly name: Schema.String;
                }>;
            }>, Schema.TaggedStruct<"index", {
                readonly field: Schema.TaggedStruct<"FieldId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly owner: Schema.Struct<{
                        readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                        readonly name: Schema.String;
                    }>;
                    readonly localName: Schema.String;
                }>;
            }>, Schema.TaggedStruct<"refIndex", {
                readonly field: Schema.TaggedStruct<"FieldId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly owner: Schema.Struct<{
                        readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                        readonly name: Schema.String;
                    }>;
                    readonly localName: Schema.String;
                }>;
            }>, Schema.TaggedStruct<"principal", {
                readonly field: Schema.TaggedStruct<"FieldId", {
                    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                    readonly owner: Schema.Struct<{
                        readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                        readonly name: Schema.String;
                    }>;
                    readonly localName: Schema.String;
                }>;
            }>]>>;
        }>>;
    }>;
    readonly unitHash: Schema.brand<Schema.String, "CatalogUnitHash">;
}>;
export type LegacyInstalledCatalogUnitV1 = typeof LegacyInstalledCatalogUnitV1.Type;
export type InstalledCatalogUnitV2 = InstalledCatalogUnit & Brand.Brand<"InstalledCatalogUnitV2">;
export type AssembleCatalogUnitFailure = ValidateFailure;
type UnhashedCatalogUnitTables = Omit<InstalledCatalogUnit, "_tag" | "unitHash">;
export type NormalizeCatalogUnitOptions = {
    readonly requireCatalogAlreadyCanonical?: boolean;
};
export declare const normalizeAndValidateCatalogUnit: (catalog: CatalogDescriptorType, policy: InstalledAuthorizationIRType, version?: number, options?: NormalizeCatalogUnitOptions) => Result.Result<UnhashedCatalogUnitTables, AssembleCatalogUnitFailure>;
export declare const assembleInstalledCatalogUnit: (descriptor: CatalogDescriptorType, policy: InstalledAuthorizationIRType) => Result.Result<UnhashedCatalogUnitTables, AssembleCatalogUnitFailure>;
export declare const sealInstalledCatalogUnit: (descriptor: {
    readonly id: string & Brand.Brand<"CatalogId">;
    readonly database: string & Brand.Brand<"DatabaseId">;
    readonly version: string & Brand.Brand<"CatalogVersion">;
    readonly fingerprint: string & Brand.Brand<"SchemaFingerprint">;
    readonly entities: readonly {
        readonly id: {
            readonly _tag: "EntityId";
            readonly catalog: string & Brand.Brand<"CatalogId">;
            readonly name: string;
        };
        readonly traits: readonly {
            readonly _tag: "TraitId";
            readonly catalog: string & Brand.Brand<"CatalogId">;
            readonly name: string;
        }[];
        readonly doc?: string | undefined;
    }[];
    readonly traits: readonly {
        readonly id: {
            readonly _tag: "TraitId";
            readonly catalog: string & Brand.Brand<"CatalogId">;
            readonly name: string;
        };
        readonly traits: readonly {
            readonly _tag: "TraitId";
            readonly catalog: string & Brand.Brand<"CatalogId">;
            readonly name: string;
        }[];
        readonly doc?: string | undefined;
    }[];
    readonly fields: readonly ({
        readonly id: {
            readonly _tag: "FieldId";
            readonly catalog: string & Brand.Brand<"CatalogId">;
            readonly owner: {
                readonly kind: "entity" | "trait";
                readonly name: string;
            };
            readonly localName: string;
        };
        readonly cardinality: "many" | "one";
        readonly unique?: "strict" | "upsert" | undefined;
        readonly index: boolean;
        readonly optional: boolean;
        readonly owned: boolean;
        readonly doc?: string | undefined;
        readonly valueType: "boolean" | "bytes" | "double" | "instant" | "long" | "string" | "uuid";
    } | {
        readonly id: {
            readonly _tag: "FieldId";
            readonly catalog: string & Brand.Brand<"CatalogId">;
            readonly owner: {
                readonly kind: "entity" | "trait";
                readonly name: string;
            };
            readonly localName: string;
        };
        readonly cardinality: "many" | "one";
        readonly unique?: "strict" | "upsert" | undefined;
        readonly index: boolean;
        readonly optional: boolean;
        readonly owned: boolean;
        readonly doc?: string | undefined;
        readonly valueType: "ref";
        readonly refTarget: {
            readonly _tag: "entity";
            readonly entity: {
                readonly _tag: "EntityId";
                readonly catalog: string & Brand.Brand<"CatalogId">;
                readonly name: string;
            };
        } | {
            readonly _tag: "trait";
            readonly trait: {
                readonly _tag: "TraitId";
                readonly catalog: string & Brand.Brand<"CatalogId">;
                readonly name: string;
            };
        } | {
            readonly _tag: "self";
        } | {
            readonly _tag: "untargeted";
        };
    })[];
    readonly operations: readonly {
        readonly id: {
            readonly _tag: "OperationId";
            readonly catalog: string & Brand.Brand<"CatalogId">;
            readonly owner: {
                readonly kind: "entity" | "trait";
                readonly name: string;
            };
            readonly localName: string;
            readonly target: "none" | "required";
        };
        readonly input: OperationInputShape;
        readonly output: OperationInputShape;
        readonly version: string & Brand.Brand<"OperationVersion">;
        readonly revision: number;
        readonly inputSchemaHash: string;
        readonly outputSchemaHash: string;
        readonly bodyHash: string;
        readonly composers: readonly {
            readonly _tag: "EntityId";
            readonly catalog: string & Brand.Brand<"CatalogId">;
            readonly name: string;
        }[];
        readonly writes: readonly {
            readonly _tag: "EntityId";
            readonly catalog: string & Brand.Brand<"CatalogId">;
            readonly name: string;
        }[];
        readonly allocations?: readonly {
            readonly slot: string;
            readonly path: readonly (string | number)[];
        }[] | undefined;
        readonly doc?: string | undefined;
    }[];
    readonly traitComposition: readonly {
        readonly composer: {
            readonly _tag: "EntityId";
            readonly catalog: string & Brand.Brand<"CatalogId">;
            readonly name: string;
        };
        readonly trait: {
            readonly _tag: "TraitId";
            readonly catalog: string & Brand.Brand<"CatalogId">;
            readonly name: string;
        };
        readonly transitive: readonly {
            readonly _tag: "TraitId";
            readonly catalog: string & Brand.Brand<"CatalogId">;
            readonly name: string;
        }[];
    }[];
}, policy: InstalledAuthorizationIRV2Type) => Effect.Effect<InstalledCatalogUnitV2, CatalogUnitCorrupt | ValidateFailure, never>;
export declare const verifyInstalledCatalogUnit: (document: {
    readonly _tag: "InstalledCatalogUnit";
    readonly version: 2;
    readonly catalog: {
        readonly id: string & Brand.Brand<"CatalogId">;
        readonly database: string & Brand.Brand<"DatabaseId">;
        readonly version: string & Brand.Brand<"CatalogVersion">;
        readonly fingerprint: string & Brand.Brand<"SchemaFingerprint">;
        readonly entities: readonly {
            readonly id: {
                readonly _tag: "EntityId";
                readonly catalog: string & Brand.Brand<"CatalogId">;
                readonly name: string;
            };
            readonly traits: readonly {
                readonly _tag: "TraitId";
                readonly catalog: string & Brand.Brand<"CatalogId">;
                readonly name: string;
            }[];
            readonly doc?: string | undefined;
        }[];
        readonly traits: readonly {
            readonly id: {
                readonly _tag: "TraitId";
                readonly catalog: string & Brand.Brand<"CatalogId">;
                readonly name: string;
            };
            readonly traits: readonly {
                readonly _tag: "TraitId";
                readonly catalog: string & Brand.Brand<"CatalogId">;
                readonly name: string;
            }[];
            readonly doc?: string | undefined;
        }[];
        readonly fields: readonly ({
            readonly id: {
                readonly _tag: "FieldId";
                readonly catalog: string & Brand.Brand<"CatalogId">;
                readonly owner: {
                    readonly kind: "entity" | "trait";
                    readonly name: string;
                };
                readonly localName: string;
            };
            readonly cardinality: "many" | "one";
            readonly unique?: "strict" | "upsert" | undefined;
            readonly index: boolean;
            readonly optional: boolean;
            readonly owned: boolean;
            readonly doc?: string | undefined;
            readonly valueType: "boolean" | "bytes" | "double" | "instant" | "long" | "string" | "uuid";
        } | {
            readonly id: {
                readonly _tag: "FieldId";
                readonly catalog: string & Brand.Brand<"CatalogId">;
                readonly owner: {
                    readonly kind: "entity" | "trait";
                    readonly name: string;
                };
                readonly localName: string;
            };
            readonly cardinality: "many" | "one";
            readonly unique?: "strict" | "upsert" | undefined;
            readonly index: boolean;
            readonly optional: boolean;
            readonly owned: boolean;
            readonly doc?: string | undefined;
            readonly valueType: "ref";
            readonly refTarget: {
                readonly _tag: "entity";
                readonly entity: {
                    readonly _tag: "EntityId";
                    readonly catalog: string & Brand.Brand<"CatalogId">;
                    readonly name: string;
                };
            } | {
                readonly _tag: "trait";
                readonly trait: {
                    readonly _tag: "TraitId";
                    readonly catalog: string & Brand.Brand<"CatalogId">;
                    readonly name: string;
                };
            } | {
                readonly _tag: "self";
            } | {
                readonly _tag: "untargeted";
            };
        })[];
        readonly operations: readonly {
            readonly id: {
                readonly _tag: "OperationId";
                readonly catalog: string & Brand.Brand<"CatalogId">;
                readonly owner: {
                    readonly kind: "entity" | "trait";
                    readonly name: string;
                };
                readonly localName: string;
                readonly target: "none" | "required";
            };
            readonly input: OperationInputShape;
            readonly output: OperationInputShape;
            readonly version: string & Brand.Brand<"OperationVersion">;
            readonly revision: number;
            readonly inputSchemaHash: string;
            readonly outputSchemaHash: string;
            readonly bodyHash: string;
            readonly composers: readonly {
                readonly _tag: "EntityId";
                readonly catalog: string & Brand.Brand<"CatalogId">;
                readonly name: string;
            }[];
            readonly writes: readonly {
                readonly _tag: "EntityId";
                readonly catalog: string & Brand.Brand<"CatalogId">;
                readonly name: string;
            }[];
            readonly allocations?: readonly {
                readonly slot: string;
                readonly path: readonly (string | number)[];
            }[] | undefined;
            readonly doc?: string | undefined;
        }[];
        readonly traitComposition: readonly {
            readonly composer: {
                readonly _tag: "EntityId";
                readonly catalog: string & Brand.Brand<"CatalogId">;
                readonly name: string;
            };
            readonly trait: {
                readonly _tag: "TraitId";
                readonly catalog: string & Brand.Brand<"CatalogId">;
                readonly name: string;
            };
            readonly transitive: readonly {
                readonly _tag: "TraitId";
                readonly catalog: string & Brand.Brand<"CatalogId">;
                readonly name: string;
            }[];
        }[];
    };
    readonly policy: {
        readonly _tag: "InstalledAuthorizationIR";
        readonly version: 2;
        readonly languageVersion: "v1";
        readonly policyHash: string & Brand.Brand<"PolicyHash">;
        readonly classes: readonly string[];
        readonly claims: readonly {
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
        readonly principal: {
            readonly subjectClaim: string;
            readonly entity?: {
                readonly _tag: "FieldId";
                readonly catalog: string & Brand.Brand<"CatalogId">;
                readonly owner: {
                    readonly kind: "entity" | "trait";
                    readonly name: string;
                };
                readonly localName: string;
            } | undefined;
        };
        readonly rules: readonly {
            readonly id: string & Brand.Brand<"RuleId">;
            readonly focus: {
                readonly _tag: "entity";
                readonly entity: {
                    readonly _tag: "EntityId";
                    readonly catalog: string & Brand.Brand<"CatalogId">;
                    readonly name: string;
                };
            } | {
                readonly _tag: "trait";
                readonly trait: {
                    readonly _tag: "TraitId";
                    readonly catalog: string & Brand.Brand<"CatalogId">;
                    readonly name: string;
                };
            } | {
                readonly _tag: "field";
                readonly field: {
                    readonly _tag: "FieldId";
                    readonly catalog: string & Brand.Brand<"CatalogId">;
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
                    readonly catalog: string & Brand.Brand<"CatalogId">;
                    readonly owner: {
                        readonly kind: "entity" | "trait";
                        readonly name: string;
                    };
                    readonly localName: string;
                    readonly target: "none" | "required";
                };
            };
            readonly expr: import("./expr.ts").CanonicalAuthorizationExpr;
            readonly usesResource: boolean;
            readonly usesMe: boolean;
            readonly usesSubject: boolean;
            readonly traversalDepth: number;
        }[];
        readonly decisions: {
            readonly entities: readonly {
                readonly target: {
                    readonly _tag: "EntityId";
                    readonly catalog: string & Brand.Brand<"CatalogId">;
                    readonly name: string;
                };
                readonly decision: {
                    readonly allow: readonly (string & Brand.Brand<"RuleId">)[];
                    readonly deny: readonly (string & Brand.Brand<"RuleId">)[];
                };
            }[];
            readonly traits: readonly {
                readonly target: {
                    readonly _tag: "TraitId";
                    readonly catalog: string & Brand.Brand<"CatalogId">;
                    readonly name: string;
                };
                readonly decision: {
                    readonly allow: readonly (string & Brand.Brand<"RuleId">)[];
                    readonly deny: readonly (string & Brand.Brand<"RuleId">)[];
                };
            }[];
            readonly fields: readonly {
                readonly target: {
                    readonly _tag: "FieldId";
                    readonly catalog: string & Brand.Brand<"CatalogId">;
                    readonly owner: {
                        readonly kind: "entity" | "trait";
                        readonly name: string;
                    };
                    readonly localName: string;
                };
                readonly decision: {
                    readonly allow: readonly (string & Brand.Brand<"RuleId">)[];
                    readonly deny: readonly (string & Brand.Brand<"RuleId">)[];
                };
            }[];
            readonly operations: readonly {
                readonly target: {
                    readonly _tag: "OperationId";
                    readonly catalog: string & Brand.Brand<"CatalogId">;
                    readonly owner: {
                        readonly kind: "entity" | "trait";
                        readonly name: string;
                    };
                    readonly localName: string;
                    readonly target: "none" | "required";
                };
                readonly decision: {
                    readonly allow: readonly (string & Brand.Brand<"RuleId">)[];
                    readonly deny: readonly (string & Brand.Brand<"RuleId">)[];
                };
            }[];
        };
        readonly accessPlans: readonly {
            readonly rule: string & Brand.Brand<"RuleId">;
            readonly lookups: readonly ({
                readonly _tag: "field";
                readonly field: {
                    readonly _tag: "FieldId";
                    readonly catalog: string & Brand.Brand<"CatalogId">;
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
                    readonly catalog: string & Brand.Brand<"CatalogId">;
                    readonly name: string;
                };
            } | {
                readonly _tag: "trait";
                readonly trait: {
                    readonly _tag: "TraitId";
                    readonly catalog: string & Brand.Brand<"CatalogId">;
                    readonly name: string;
                };
            } | {
                readonly _tag: "index";
                readonly field: {
                    readonly _tag: "FieldId";
                    readonly catalog: string & Brand.Brand<"CatalogId">;
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
                    readonly catalog: string & Brand.Brand<"CatalogId">;
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
                    readonly catalog: string & Brand.Brand<"CatalogId">;
                    readonly owner: {
                        readonly kind: "entity" | "trait";
                        readonly name: string;
                    };
                    readonly localName: string;
                };
            })[];
        }[];
    };
    readonly unitHash: string & Brand.Brand<"CatalogUnitHash">;
}) => Effect.Effect<InstalledCatalogUnitV2, CatalogUnitCorrupt | ValidateFailure, never>;
export declare const catalogUnitCanonicalBytes: (document: InstalledCatalogUnit) => Uint8Array;
export {};
//# sourceMappingURL=catalog-unit.d.ts.map