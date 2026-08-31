import type * as Brand from "effect/Brand";
import * as Schema from "effect/Schema";
import { CanonicalAuthorizationExpr, RelativeAuthorizationExpr } from "./expr.ts";
import { type AnyIdentitySchemaSpace, type CanonicalIdentities, type IdentitySpace, type RelativeIdentities } from "./identities.ts";
export declare const POLICY_TEMPLATE_IR_VERSION: 2;
export declare const BOUND_AUTHORIZATION_IR_VERSION: 2;
export declare const VALIDATED_AUTHORIZATION_IR_VERSION: 2;
export declare const INSTALLED_AUTHORIZATION_IR_VERSION: 2;
export declare const PolicyTemplateIRVersion: Schema.Literal<2>;
export type PolicyTemplateIRVersion = typeof PolicyTemplateIRVersion.Type;
export declare const BoundAuthorizationIRVersion: Schema.Literal<2>;
export type BoundAuthorizationIRVersion = typeof BoundAuthorizationIRVersion.Type;
export declare const ValidatedAuthorizationIRVersion: Schema.Literal<2>;
export type ValidatedAuthorizationIRVersion = typeof ValidatedAuthorizationIRVersion.Type;
export declare const InstalledAuthorizationIRVersion: Schema.Literal<2>;
export type InstalledAuthorizationIRVersion = typeof InstalledAuthorizationIRVersion.Type;
export declare const RuleFocus: <Entity extends Schema.Top, Trait extends Schema.Top, Field extends Schema.Top, Operation extends Schema.Top>(ids: AnyIdentitySchemaSpace<Entity, Trait, Field, Operation>) => Schema.Union<readonly [Schema.TaggedStruct<"entity", {
    readonly entity: Entity;
}>, Schema.TaggedStruct<"trait", {
    readonly trait: Trait;
}>, Schema.TaggedStruct<"field", {
    readonly field: Field;
}>, Schema.TaggedStruct<"operation", {
    readonly operation: Operation;
}>]>;
export declare const AuthorizationRule: <Entity extends Schema.Top, Trait extends Schema.Top, Field extends Schema.Top, Operation extends Schema.Top, Expr extends Schema.Top>(ids: AnyIdentitySchemaSpace<Entity, Trait, Field, Operation>, expr: Expr) => Schema.Struct<{
    readonly id: Schema.brand<Schema.String, "RuleId">;
    readonly focus: Schema.Union<readonly [Schema.TaggedStruct<"entity", {
        readonly entity: Entity;
    }>, Schema.TaggedStruct<"trait", {
        readonly trait: Trait;
    }>, Schema.TaggedStruct<"field", {
        readonly field: Field;
    }>, Schema.TaggedStruct<"operation", {
        readonly operation: Operation;
    }>]>;
    readonly expr: Expr;
    readonly usesResource: Schema.Boolean;
    readonly usesMe: Schema.Boolean;
    readonly usesSubject: Schema.Boolean;
    readonly traversalDepth: Schema.Natural;
}>;
export declare const Decision: Schema.Struct<{
    readonly allow: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
    readonly deny: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
}>;
export type Decision = typeof Decision.Type;
export declare const DecisionEntry: <Target extends Schema.Top>(target: Target) => Schema.Struct<{
    readonly target: Target;
    readonly decision: Schema.Struct<{
        readonly allow: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
        readonly deny: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
    }>;
}>;
export declare const AuthorizationDecisions: <Entity extends Schema.Top, Trait extends Schema.Top, Field extends Schema.Top, Operation extends Schema.Top>(ids: AnyIdentitySchemaSpace<Entity, Trait, Field, Operation>) => Schema.Struct<{
    readonly entities: Schema.$Array<Schema.Struct<{
        readonly target: Entity;
        readonly decision: Schema.Struct<{
            readonly allow: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
            readonly deny: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
        }>;
    }>>;
    readonly traits: Schema.$Array<Schema.Struct<{
        readonly target: Trait;
        readonly decision: Schema.Struct<{
            readonly allow: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
            readonly deny: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
        }>;
    }>>;
    readonly fields: Schema.$Array<Schema.Struct<{
        readonly target: Field;
        readonly decision: Schema.Struct<{
            readonly allow: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
            readonly deny: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
        }>;
    }>>;
    readonly operations: Schema.$Array<Schema.Struct<{
        readonly target: Operation;
        readonly decision: Schema.Struct<{
            readonly allow: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
            readonly deny: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
        }>;
    }>>;
}>;
export declare const PolicyTemplateIR: Schema.TaggedStruct<"PolicyTemplateIR", {
    readonly version: Schema.Literal<2>;
    readonly languageVersion: Schema.Literal<"v1">;
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
        readonly entity: Schema.optionalKey<Schema.TaggedStruct<"RelativeFieldId", {
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
            readonly entity: Schema.TaggedStruct<"RelativeEntityId", {
                readonly name: Schema.String;
            }>;
        }>, Schema.TaggedStruct<"trait", {
            readonly trait: Schema.TaggedStruct<"RelativeTraitId", {
                readonly name: Schema.String;
            }>;
        }>, Schema.TaggedStruct<"field", {
            readonly field: Schema.TaggedStruct<"RelativeFieldId", {
                readonly owner: Schema.Struct<{
                    readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                    readonly name: Schema.String;
                }>;
                readonly localName: Schema.String;
            }>;
        }>, Schema.TaggedStruct<"operation", {
            readonly operation: Schema.TaggedStruct<"RelativeOperationId", {
                readonly owner: Schema.Struct<{
                    readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                    readonly name: Schema.String;
                }>;
                readonly localName: Schema.String;
                readonly target: Schema.Literals<readonly ["required", "none"]>;
            }>;
        }>]>;
        readonly expr: Schema.Codec<RelativeAuthorizationExpr, import("./expr.ts").RelativeAuthorizationExprEncoded, never, never>;
        readonly usesResource: Schema.Boolean;
        readonly usesMe: Schema.Boolean;
        readonly usesSubject: Schema.Boolean;
        readonly traversalDepth: Schema.Natural;
    }>>;
    readonly decisions: Schema.Struct<{
        readonly entities: Schema.$Array<Schema.Struct<{
            readonly target: Schema.TaggedStruct<"RelativeEntityId", {
                readonly name: Schema.String;
            }>;
            readonly decision: Schema.Struct<{
                readonly allow: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
                readonly deny: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
            }>;
        }>>;
        readonly traits: Schema.$Array<Schema.Struct<{
            readonly target: Schema.TaggedStruct<"RelativeTraitId", {
                readonly name: Schema.String;
            }>;
            readonly decision: Schema.Struct<{
                readonly allow: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
                readonly deny: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
            }>;
        }>>;
        readonly fields: Schema.$Array<Schema.Struct<{
            readonly target: Schema.TaggedStruct<"RelativeFieldId", {
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
            readonly target: Schema.TaggedStruct<"RelativeOperationId", {
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
}>;
export type PolicyTemplateIR = typeof PolicyTemplateIR.Type;
export declare const BoundAuthorizationIR: Schema.TaggedStruct<"BoundAuthorizationIR", {
    readonly version: Schema.Literal<2>;
    readonly languageVersion: Schema.Literal<"v1">;
    readonly database: Schema.brand<Schema.String, "DatabaseId">;
    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
    readonly catalogVersion: Schema.brand<Schema.String, "CatalogVersion">;
    readonly schemaFingerprint: Schema.brand<Schema.String, "SchemaFingerprint">;
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
        readonly expr: Schema.Codec<CanonicalAuthorizationExpr, import("./expr.ts").CanonicalAuthorizationExprEncoded, never, never>;
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
}>;
export type BoundAuthorizationIR = typeof BoundAuthorizationIR.Type;
export declare const ValidatedAuthorizationIR: Schema.TaggedStruct<"ValidatedAuthorizationIR", {
    readonly version: Schema.Literal<2>;
    readonly languageVersion: Schema.Literal<"v1">;
    readonly database: Schema.brand<Schema.String, "DatabaseId">;
    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
    readonly catalogVersion: Schema.brand<Schema.String, "CatalogVersion">;
    readonly schemaFingerprint: Schema.brand<Schema.String, "SchemaFingerprint">;
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
        readonly expr: Schema.Codec<CanonicalAuthorizationExpr, import("./expr.ts").CanonicalAuthorizationExprEncoded, never, never>;
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
}>;
export type ValidatedAuthorizationIR = typeof ValidatedAuthorizationIR.Type;
export declare const AuthorizationValidationInput: Schema.Struct<{
    readonly bound: Schema.TaggedStruct<"BoundAuthorizationIR", {
        readonly version: Schema.Literal<2>;
        readonly languageVersion: Schema.Literal<"v1">;
        readonly database: Schema.brand<Schema.String, "DatabaseId">;
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly catalogVersion: Schema.brand<Schema.String, "CatalogVersion">;
        readonly schemaFingerprint: Schema.brand<Schema.String, "SchemaFingerprint">;
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
            readonly expr: Schema.Codec<CanonicalAuthorizationExpr, import("./expr.ts").CanonicalAuthorizationExprEncoded, never, never>;
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
    }>;
    readonly descriptor: Schema.Struct<{
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
            readonly input: Schema.Codec<import("./catalog.ts").OperationInputShape, import("./catalog.ts").OperationInputShapeEncoded, never, never>;
            readonly output: Schema.Codec<import("./catalog.ts").OperationInputShape, import("./catalog.ts").OperationInputShapeEncoded, never, never>;
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
}>;
export type AuthorizationValidationInput = typeof AuthorizationValidationInput.Type;
export declare const InstalledAuthorizationIR: Schema.TaggedStruct<"InstalledAuthorizationIR", {
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
        readonly expr: Schema.Codec<CanonicalAuthorizationExpr, import("./expr.ts").CanonicalAuthorizationExprEncoded, never, never>;
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
export type InstalledAuthorizationIR = typeof InstalledAuthorizationIR.Type;
export declare const LegacyInstalledAuthorizationIRV1: Schema.TaggedStruct<"InstalledAuthorizationIR", {
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
        readonly expr: Schema.Codec<CanonicalAuthorizationExpr, import("./expr.ts").CanonicalAuthorizationExprEncoded, never, never>;
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
export type LegacyInstalledAuthorizationIRV1 = typeof LegacyInstalledAuthorizationIRV1.Type;
export type InstalledAuthorizationIRV2 = InstalledAuthorizationIR & Brand.Brand<"InstalledAuthorizationIRV2">;
export declare const CatalogBindingTarget: Schema.Struct<{
    readonly database: Schema.brand<Schema.String, "DatabaseId">;
    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
    readonly catalogVersion: Schema.brand<Schema.String, "CatalogVersion">;
    readonly schemaFingerprint: Schema.brand<Schema.String, "SchemaFingerprint">;
}>;
export type CatalogBindingTarget = typeof CatalogBindingTarget.Type;
export declare const CatalogBindingInput: Schema.Struct<{
    readonly target: Schema.Struct<{
        readonly database: Schema.brand<Schema.String, "DatabaseId">;
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly catalogVersion: Schema.brand<Schema.String, "CatalogVersion">;
        readonly schemaFingerprint: Schema.brand<Schema.String, "SchemaFingerprint">;
    }>;
    readonly descriptor: Schema.Struct<{
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
            readonly input: Schema.Codec<import("./catalog.ts").OperationInputShape, import("./catalog.ts").OperationInputShapeEncoded, never, never>;
            readonly output: Schema.Codec<import("./catalog.ts").OperationInputShape, import("./catalog.ts").OperationInputShapeEncoded, never, never>;
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
    readonly template: Schema.TaggedStruct<"PolicyTemplateIR", {
        readonly version: Schema.Literal<2>;
        readonly languageVersion: Schema.Literal<"v1">;
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
            readonly entity: Schema.optionalKey<Schema.TaggedStruct<"RelativeFieldId", {
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
                readonly entity: Schema.TaggedStruct<"RelativeEntityId", {
                    readonly name: Schema.String;
                }>;
            }>, Schema.TaggedStruct<"trait", {
                readonly trait: Schema.TaggedStruct<"RelativeTraitId", {
                    readonly name: Schema.String;
                }>;
            }>, Schema.TaggedStruct<"field", {
                readonly field: Schema.TaggedStruct<"RelativeFieldId", {
                    readonly owner: Schema.Struct<{
                        readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                        readonly name: Schema.String;
                    }>;
                    readonly localName: Schema.String;
                }>;
            }>, Schema.TaggedStruct<"operation", {
                readonly operation: Schema.TaggedStruct<"RelativeOperationId", {
                    readonly owner: Schema.Struct<{
                        readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                        readonly name: Schema.String;
                    }>;
                    readonly localName: Schema.String;
                    readonly target: Schema.Literals<readonly ["required", "none"]>;
                }>;
            }>]>;
            readonly expr: Schema.Codec<RelativeAuthorizationExpr, import("./expr.ts").RelativeAuthorizationExprEncoded, never, never>;
            readonly usesResource: Schema.Boolean;
            readonly usesMe: Schema.Boolean;
            readonly usesSubject: Schema.Boolean;
            readonly traversalDepth: Schema.Natural;
        }>>;
        readonly decisions: Schema.Struct<{
            readonly entities: Schema.$Array<Schema.Struct<{
                readonly target: Schema.TaggedStruct<"RelativeEntityId", {
                    readonly name: Schema.String;
                }>;
                readonly decision: Schema.Struct<{
                    readonly allow: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
                    readonly deny: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
                }>;
            }>>;
            readonly traits: Schema.$Array<Schema.Struct<{
                readonly target: Schema.TaggedStruct<"RelativeTraitId", {
                    readonly name: Schema.String;
                }>;
                readonly decision: Schema.Struct<{
                    readonly allow: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
                    readonly deny: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
                }>;
            }>>;
            readonly fields: Schema.$Array<Schema.Struct<{
                readonly target: Schema.TaggedStruct<"RelativeFieldId", {
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
                readonly target: Schema.TaggedStruct<"RelativeOperationId", {
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
    }>;
}>;
export type CatalogBindingInput = typeof CatalogBindingInput.Type;
export declare const RelativeRuleFocus: Schema.Union<readonly [Schema.TaggedStruct<"entity", {
    readonly entity: Schema.TaggedStruct<"RelativeEntityId", {
        readonly name: Schema.String;
    }>;
}>, Schema.TaggedStruct<"trait", {
    readonly trait: Schema.TaggedStruct<"RelativeTraitId", {
        readonly name: Schema.String;
    }>;
}>, Schema.TaggedStruct<"field", {
    readonly field: Schema.TaggedStruct<"RelativeFieldId", {
        readonly owner: Schema.Struct<{
            readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
            readonly name: Schema.String;
        }>;
        readonly localName: Schema.String;
    }>;
}>, Schema.TaggedStruct<"operation", {
    readonly operation: Schema.TaggedStruct<"RelativeOperationId", {
        readonly owner: Schema.Struct<{
            readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
            readonly name: Schema.String;
        }>;
        readonly localName: Schema.String;
        readonly target: Schema.Literals<readonly ["required", "none"]>;
    }>;
}>]>;
export type RelativeRuleFocus = typeof RelativeRuleFocus.Type;
export declare const CanonicalRuleFocus: Schema.Union<readonly [Schema.TaggedStruct<"entity", {
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
export type CanonicalRuleFocus = typeof CanonicalRuleFocus.Type;
export declare const RelativeAuthorizationRule: Schema.Struct<{
    readonly id: Schema.brand<Schema.String, "RuleId">;
    readonly focus: Schema.Union<readonly [Schema.TaggedStruct<"entity", {
        readonly entity: Schema.TaggedStruct<"RelativeEntityId", {
            readonly name: Schema.String;
        }>;
    }>, Schema.TaggedStruct<"trait", {
        readonly trait: Schema.TaggedStruct<"RelativeTraitId", {
            readonly name: Schema.String;
        }>;
    }>, Schema.TaggedStruct<"field", {
        readonly field: Schema.TaggedStruct<"RelativeFieldId", {
            readonly owner: Schema.Struct<{
                readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                readonly name: Schema.String;
            }>;
            readonly localName: Schema.String;
        }>;
    }>, Schema.TaggedStruct<"operation", {
        readonly operation: Schema.TaggedStruct<"RelativeOperationId", {
            readonly owner: Schema.Struct<{
                readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                readonly name: Schema.String;
            }>;
            readonly localName: Schema.String;
            readonly target: Schema.Literals<readonly ["required", "none"]>;
        }>;
    }>]>;
    readonly expr: Schema.Codec<RelativeAuthorizationExpr, import("./expr.ts").RelativeAuthorizationExprEncoded, never, never>;
    readonly usesResource: Schema.Boolean;
    readonly usesMe: Schema.Boolean;
    readonly usesSubject: Schema.Boolean;
    readonly traversalDepth: Schema.Natural;
}>;
export type RelativeAuthorizationRule = typeof RelativeAuthorizationRule.Type;
export declare const CanonicalAuthorizationRule: Schema.Struct<{
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
    readonly expr: Schema.Codec<CanonicalAuthorizationExpr, import("./expr.ts").CanonicalAuthorizationExprEncoded, never, never>;
    readonly usesResource: Schema.Boolean;
    readonly usesMe: Schema.Boolean;
    readonly usesSubject: Schema.Boolean;
    readonly traversalDepth: Schema.Natural;
}>;
export type CanonicalAuthorizationRule = typeof CanonicalAuthorizationRule.Type;
export declare const RelativeAuthorizationDecisions: Schema.Struct<{
    readonly entities: Schema.$Array<Schema.Struct<{
        readonly target: Schema.TaggedStruct<"RelativeEntityId", {
            readonly name: Schema.String;
        }>;
        readonly decision: Schema.Struct<{
            readonly allow: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
            readonly deny: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
        }>;
    }>>;
    readonly traits: Schema.$Array<Schema.Struct<{
        readonly target: Schema.TaggedStruct<"RelativeTraitId", {
            readonly name: Schema.String;
        }>;
        readonly decision: Schema.Struct<{
            readonly allow: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
            readonly deny: Schema.$Array<Schema.brand<Schema.String, "RuleId">>;
        }>;
    }>>;
    readonly fields: Schema.$Array<Schema.Struct<{
        readonly target: Schema.TaggedStruct<"RelativeFieldId", {
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
        readonly target: Schema.TaggedStruct<"RelativeOperationId", {
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
export type RelativeAuthorizationDecisions = typeof RelativeAuthorizationDecisions.Type;
export declare const CanonicalAuthorizationDecisions: Schema.Struct<{
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
export type CanonicalAuthorizationDecisions = typeof CanonicalAuthorizationDecisions.Type;
export type RuleFocus<I extends IdentitySpace = RelativeIdentities> = I extends CanonicalIdentities ? CanonicalRuleFocus : RelativeRuleFocus;
export type AuthorizationRule<I extends IdentitySpace = RelativeIdentities> = I extends CanonicalIdentities ? CanonicalAuthorizationRule : RelativeAuthorizationRule;
export type AuthorizationDecisions<I extends IdentitySpace = RelativeIdentities> = I extends CanonicalIdentities ? CanonicalAuthorizationDecisions : RelativeAuthorizationDecisions;
export type DecisionEntry<Target extends Schema.Top> = ReturnType<typeof DecisionEntry<Target>>["Type"];
//# sourceMappingURL=ir.d.ts.map