import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { type AuthorizationValidationInput, type ValidatedAuthorizationIR as ValidatedAuthorizationIRType } from "../ir.ts";
import { defaultValidationLimits, type ValidationLimits, type ValidateFailure } from "./common.ts";
export type { ValidateFailure, ValidationLimits };
export { defaultValidationLimits };
export declare const validateBoundAuthorizationResult: (input: AuthorizationValidationInput) => Result.Result<ValidatedAuthorizationIRType, ValidateFailure>;
export declare const validateBoundAuthorizationResultForTest: (input: AuthorizationValidationInput, limits: Partial<ValidationLimits>) => Result.Result<ValidatedAuthorizationIRType, ValidateFailure>;
export declare const validateBoundAuthorization: (input: {
    readonly bound: {
        readonly _tag: "BoundAuthorizationIR";
        readonly version: 2;
        readonly languageVersion: "v1";
        readonly database: string & import("effect/Brand").Brand<"DatabaseId">;
        readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
        readonly catalogVersion: string & import("effect/Brand").Brand<"CatalogVersion">;
        readonly schemaFingerprint: string & import("effect/Brand").Brand<"SchemaFingerprint">;
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
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly owner: {
                    readonly kind: "entity" | "trait";
                    readonly name: string;
                };
                readonly localName: string;
            } | undefined;
        };
        readonly rules: readonly {
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
        readonly decisions: {
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
    };
    readonly descriptor: {
        readonly id: string & import("effect/Brand").Brand<"CatalogId">;
        readonly database: string & import("effect/Brand").Brand<"DatabaseId">;
        readonly version: string & import("effect/Brand").Brand<"CatalogVersion">;
        readonly fingerprint: string & import("effect/Brand").Brand<"SchemaFingerprint">;
        readonly entities: readonly {
            readonly id: {
                readonly _tag: "EntityId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly name: string;
            };
            readonly traits: readonly {
                readonly _tag: "TraitId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly name: string;
            }[];
            readonly doc?: string | undefined;
        }[];
        readonly traits: readonly {
            readonly id: {
                readonly _tag: "TraitId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly name: string;
            };
            readonly traits: readonly {
                readonly _tag: "TraitId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly name: string;
            }[];
            readonly doc?: string | undefined;
        }[];
        readonly fields: readonly ({
            readonly id: {
                readonly _tag: "FieldId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
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
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
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
                readonly _tag: "self";
            } | {
                readonly _tag: "untargeted";
            };
        })[];
        readonly operations: readonly {
            readonly id: {
                readonly _tag: "OperationId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly owner: {
                    readonly kind: "entity" | "trait";
                    readonly name: string;
                };
                readonly localName: string;
                readonly target: "none" | "required";
            };
            readonly input: import("../catalog.ts").OperationInputShape;
            readonly output: import("../catalog.ts").OperationInputShape;
            readonly version: string & import("effect/Brand").Brand<"OperationVersion">;
            readonly revision: number;
            readonly inputSchemaHash: string;
            readonly outputSchemaHash: string;
            readonly bodyHash: string;
            readonly composers: readonly {
                readonly _tag: "EntityId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly name: string;
            }[];
            readonly writes: readonly {
                readonly _tag: "EntityId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
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
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly name: string;
            };
            readonly trait: {
                readonly _tag: "TraitId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly name: string;
            };
            readonly transitive: readonly {
                readonly _tag: "TraitId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly name: string;
            }[];
        }[];
    };
}) => Effect.Effect<{
    readonly _tag: "ValidatedAuthorizationIR";
    readonly version: 2;
    readonly languageVersion: "v1";
    readonly database: string & import("effect/Brand").Brand<"DatabaseId">;
    readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
    readonly catalogVersion: string & import("effect/Brand").Brand<"CatalogVersion">;
    readonly schemaFingerprint: string & import("effect/Brand").Brand<"SchemaFingerprint">;
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
            readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
            readonly owner: {
                readonly kind: "entity" | "trait";
                readonly name: string;
            };
            readonly localName: string;
        } | undefined;
    };
    readonly rules: readonly {
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
    readonly decisions: {
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
}, ValidateFailure, never>;
//# sourceMappingURL=validate.d.ts.map