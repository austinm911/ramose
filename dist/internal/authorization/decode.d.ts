import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { InstalledCatalogUnit, type InstalledCatalogUnit as InstalledCatalogUnitType, type LegacyInstalledCatalogUnitV1 as LegacyInstalledCatalogUnitV1Type } from "./catalog-unit.ts";
import { InvalidIR } from "./failures.ts";
import { CanonicalAuthorizationRule, InstalledAuthorizationIR, PolicyTemplateIR, RelativeAuthorizationRule, type CanonicalAuthorizationRule as CanonicalAuthorizationRuleType, type InstalledAuthorizationIR as InstalledAuthorizationIRType, type PolicyTemplateIR as PolicyTemplateIRType } from "./ir.ts";
import type { JsonValue } from "./json.ts";
export type PolicyTemplateIREncoded = typeof PolicyTemplateIR.Encoded;
export type InstalledAuthorizationIREncoded = typeof InstalledAuthorizationIR.Encoded;
export type InstalledCatalogUnitEncoded = typeof InstalledCatalogUnit.Encoded;
export type RelativeAuthorizationRuleEncoded = typeof RelativeAuthorizationRule.Encoded;
export type CanonicalAuthorizationRuleEncoded = typeof CanonicalAuthorizationRule.Encoded;
export declare const decodePolicyTemplateResult: (input: unknown) => Result.Result<PolicyTemplateIRType, InvalidIR>;
export declare const decodeInstalledAuthorizationResult: (input: unknown) => Result.Result<InstalledAuthorizationIRType, InvalidIR>;
export declare const decodeLegacyInstalledCatalogUnitV1Result: (input: unknown) => Result.Result<LegacyInstalledCatalogUnitV1Type, InvalidIR>;
export declare const decodeInstalledCatalogUnitResult: (input: unknown) => Result.Result<InstalledCatalogUnitType, InvalidIR>;
export declare const decodePolicyTemplate: (input: unknown) => Effect.Effect<{
    readonly _tag: "PolicyTemplateIR";
    readonly version: 2;
    readonly languageVersion: "v1";
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
            readonly _tag: "RelativeFieldId";
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
                readonly _tag: "RelativeEntityId";
                readonly name: string;
            };
        } | {
            readonly _tag: "trait";
            readonly trait: {
                readonly _tag: "RelativeTraitId";
                readonly name: string;
            };
        } | {
            readonly _tag: "field";
            readonly field: {
                readonly _tag: "RelativeFieldId";
                readonly owner: {
                    readonly kind: "entity" | "trait";
                    readonly name: string;
                };
                readonly localName: string;
            };
        } | {
            readonly _tag: "operation";
            readonly operation: {
                readonly _tag: "RelativeOperationId";
                readonly owner: {
                    readonly kind: "entity" | "trait";
                    readonly name: string;
                };
                readonly localName: string;
                readonly target: "none" | "required";
            };
        };
        readonly expr: import("./expr.ts").RelativeAuthorizationExpr;
        readonly usesResource: boolean;
        readonly usesMe: boolean;
        readonly usesSubject: boolean;
        readonly traversalDepth: number;
    }[];
    readonly decisions: {
        readonly entities: readonly {
            readonly target: {
                readonly _tag: "RelativeEntityId";
                readonly name: string;
            };
            readonly decision: {
                readonly allow: readonly (string & import("effect/Brand").Brand<"RuleId">)[];
                readonly deny: readonly (string & import("effect/Brand").Brand<"RuleId">)[];
            };
        }[];
        readonly traits: readonly {
            readonly target: {
                readonly _tag: "RelativeTraitId";
                readonly name: string;
            };
            readonly decision: {
                readonly allow: readonly (string & import("effect/Brand").Brand<"RuleId">)[];
                readonly deny: readonly (string & import("effect/Brand").Brand<"RuleId">)[];
            };
        }[];
        readonly fields: readonly {
            readonly target: {
                readonly _tag: "RelativeFieldId";
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
                readonly _tag: "RelativeOperationId";
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
}, InvalidIR, never>;
export declare const decodeInstalledAuthorization: (input: unknown) => Effect.Effect<{
    readonly _tag: "InstalledAuthorizationIR";
    readonly version: 2;
    readonly languageVersion: "v1";
    readonly policyHash: string & import("effect/Brand").Brand<"PolicyHash">;
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
    readonly accessPlans: readonly {
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
}, InvalidIR, never>;
export declare const decodeInstalledCatalogUnit: (input: unknown) => Effect.Effect<{
    readonly _tag: "InstalledCatalogUnit";
    readonly version: 2;
    readonly catalog: {
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
            readonly input: import("./catalog.ts").OperationInputShape;
            readonly output: import("./catalog.ts").OperationInputShape;
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
    readonly policy: {
        readonly _tag: "InstalledAuthorizationIR";
        readonly version: 2;
        readonly languageVersion: "v1";
        readonly policyHash: string & import("effect/Brand").Brand<"PolicyHash">;
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
        readonly accessPlans: readonly {
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
    };
    readonly unitHash: string & import("effect/Brand").Brand<"CatalogUnitHash">;
}, InvalidIR, never>;
export declare const encodePolicyTemplate: (document: PolicyTemplateIRType) => PolicyTemplateIREncoded;
export declare const encodeInstalledAuthorization: (document: InstalledAuthorizationIRType) => InstalledAuthorizationIREncoded;
export declare const encodeInstalledCatalogUnit: (document: InstalledCatalogUnitType) => InstalledCatalogUnitEncoded;
export declare const canonicalizePolicyTemplate: (document: PolicyTemplateIRType) => string;
export declare const canonicalizeInstalledAuthorization: (document: InstalledAuthorizationIRType) => string;
export declare const canonicalizeInstalledCatalogUnit: (document: InstalledCatalogUnitType) => string;
export declare const hashCanonicalJson: (json: JsonValue) => Effect.Effect<string, InvalidIR, never>;
export declare const hashDomainSeparatedCanonicalText: (domain: string, canonicalText: string) => Effect.Effect<string, InvalidIR, never>;
export declare const hashDomainSeparatedCanonicalJson: (domain: string, json: JsonValue) => Effect.Effect<string, InvalidIR, never>;
export declare const hashPolicyTemplate: (document: {
    readonly _tag: "PolicyTemplateIR";
    readonly version: 2;
    readonly languageVersion: "v1";
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
            readonly _tag: "RelativeFieldId";
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
                readonly _tag: "RelativeEntityId";
                readonly name: string;
            };
        } | {
            readonly _tag: "trait";
            readonly trait: {
                readonly _tag: "RelativeTraitId";
                readonly name: string;
            };
        } | {
            readonly _tag: "field";
            readonly field: {
                readonly _tag: "RelativeFieldId";
                readonly owner: {
                    readonly kind: "entity" | "trait";
                    readonly name: string;
                };
                readonly localName: string;
            };
        } | {
            readonly _tag: "operation";
            readonly operation: {
                readonly _tag: "RelativeOperationId";
                readonly owner: {
                    readonly kind: "entity" | "trait";
                    readonly name: string;
                };
                readonly localName: string;
                readonly target: "none" | "required";
            };
        };
        readonly expr: import("./expr.ts").RelativeAuthorizationExpr;
        readonly usesResource: boolean;
        readonly usesMe: boolean;
        readonly usesSubject: boolean;
        readonly traversalDepth: number;
    }[];
    readonly decisions: {
        readonly entities: readonly {
            readonly target: {
                readonly _tag: "RelativeEntityId";
                readonly name: string;
            };
            readonly decision: {
                readonly allow: readonly (string & import("effect/Brand").Brand<"RuleId">)[];
                readonly deny: readonly (string & import("effect/Brand").Brand<"RuleId">)[];
            };
        }[];
        readonly traits: readonly {
            readonly target: {
                readonly _tag: "RelativeTraitId";
                readonly name: string;
            };
            readonly decision: {
                readonly allow: readonly (string & import("effect/Brand").Brand<"RuleId">)[];
                readonly deny: readonly (string & import("effect/Brand").Brand<"RuleId">)[];
            };
        }[];
        readonly fields: readonly {
            readonly target: {
                readonly _tag: "RelativeFieldId";
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
                readonly _tag: "RelativeOperationId";
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
}) => Effect.Effect<string & import("effect/Brand").Brand<"PolicyHash">, InvalidIR, never>;
export declare const hashInstalledAuthorization: (document: {
    readonly _tag: "InstalledAuthorizationIR";
    readonly version: 2;
    readonly languageVersion: "v1";
    readonly policyHash: string & import("effect/Brand").Brand<"PolicyHash">;
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
    readonly accessPlans: readonly {
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
}) => Effect.Effect<string & import("effect/Brand").Brand<"PolicyHash">, InvalidIR, never>;
export declare const hashInstalledCatalogUnit: (document: {
    readonly _tag: "InstalledCatalogUnit";
    readonly version: 2;
    readonly catalog: {
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
            readonly input: import("./catalog.ts").OperationInputShape;
            readonly output: import("./catalog.ts").OperationInputShape;
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
    readonly policy: {
        readonly _tag: "InstalledAuthorizationIR";
        readonly version: 2;
        readonly languageVersion: "v1";
        readonly policyHash: string & import("effect/Brand").Brand<"PolicyHash">;
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
        readonly accessPlans: readonly {
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
    };
    readonly unitHash: string & import("effect/Brand").Brand<"CatalogUnitHash">;
}) => Effect.Effect<string & import("effect/Brand").Brand<"CatalogUnitHash">, InvalidIR, never>;
export declare const hashCatalogSchemaFingerprint: (tables: Pick<{
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
        readonly input: import("./catalog.ts").OperationInputShape;
        readonly output: import("./catalog.ts").OperationInputShape;
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
}, "entities" | "fields" | "operations" | "traitComposition" | "traits"> & Partial<Pick<{
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
        readonly input: import("./catalog.ts").OperationInputShape;
        readonly output: import("./catalog.ts").OperationInputShape;
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
}, "database" | "fingerprint" | "id" | "version">>) => Effect.Effect<string & import("effect/Brand").Brand<"SchemaFingerprint">, import("./validate.ts").ValidateFailure, never>;
export declare const hashRelativeRule: (rule: {
    readonly id: string & import("effect/Brand").Brand<"RuleId">;
    readonly focus: {
        readonly _tag: "entity";
        readonly entity: {
            readonly _tag: "RelativeEntityId";
            readonly name: string;
        };
    } | {
        readonly _tag: "trait";
        readonly trait: {
            readonly _tag: "RelativeTraitId";
            readonly name: string;
        };
    } | {
        readonly _tag: "field";
        readonly field: {
            readonly _tag: "RelativeFieldId";
            readonly owner: {
                readonly kind: "entity" | "trait";
                readonly name: string;
            };
            readonly localName: string;
        };
    } | {
        readonly _tag: "operation";
        readonly operation: {
            readonly _tag: "RelativeOperationId";
            readonly owner: {
                readonly kind: "entity" | "trait";
                readonly name: string;
            };
            readonly localName: string;
            readonly target: "none" | "required";
        };
    };
    readonly expr: import("./expr.ts").RelativeAuthorizationExpr;
    readonly usesResource: boolean;
    readonly usesMe: boolean;
    readonly usesSubject: boolean;
    readonly traversalDepth: number;
}) => Effect.Effect<string & import("effect/Brand").Brand<"RuleId">, InvalidIR, never>;
export declare const hashCanonicalRule: (rule: {
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
    readonly expr: import("./expr.ts").CanonicalAuthorizationExpr;
    readonly usesResource: boolean;
    readonly usesMe: boolean;
    readonly usesSubject: boolean;
    readonly traversalDepth: number;
}) => Effect.Effect<string & import("effect/Brand").Brand<"RuleId">, InvalidIR, never>;
export declare const canonicalAuthorizationRuleJson: (rule: CanonicalAuthorizationRuleType) => JsonValue;
export declare const canonicalAuthorizationRuleMaterial: (rule: CanonicalAuthorizationRuleType) => Result.Result<string, InvalidIR>;
//# sourceMappingURL=decode.d.ts.map