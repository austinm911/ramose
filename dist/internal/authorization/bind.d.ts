import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import type { CatalogDescriptor, OperationInputShape } from "./catalog.ts";
import { CatalogMismatch, InvalidIR } from "./failures.ts";
import { type BoundAuthorizationIR as BoundAuthorizationIRType, type CatalogBindingInput, type CatalogBindingTarget } from "./ir.ts";
import type { CanonicalAuthorizationExpr, RelativeAuthorizationExpr } from "./expr.ts";
export type BindFailure = InvalidIR | CatalogMismatch;
export declare const bindPolicyTemplateResult: (input: CatalogBindingInput) => Result.Result<BoundAuthorizationIRType, BindFailure>;
export declare const bindPolicyTemplate: (input: {
    readonly target: {
        readonly database: string & import("effect/Brand").Brand<"DatabaseId">;
        readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
        readonly catalogVersion: string & import("effect/Brand").Brand<"CatalogVersion">;
        readonly schemaFingerprint: string & import("effect/Brand").Brand<"SchemaFingerprint">;
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
            readonly input: OperationInputShape;
            readonly output: OperationInputShape;
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
    readonly template: {
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
            readonly expr: RelativeAuthorizationExpr;
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
    };
}) => Effect.Effect<{
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
        readonly expr: CanonicalAuthorizationExpr;
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
}, BindFailure, never>;
export interface AuthoritativeCatalogService {
    readonly resolve: (target: CatalogBindingTarget) => Effect.Effect<CatalogDescriptor, BindFailure>;
}
declare const AuthoritativeCatalog_base: Context.ServiceClass<AuthoritativeCatalog, "ramose/authorization/AuthoritativeCatalog", AuthoritativeCatalogService>;
export declare class AuthoritativeCatalog extends AuthoritativeCatalog_base {
}
export declare const bindAgainstAuthoritativeCatalog: (target: {
    readonly database: string & import("effect/Brand").Brand<"DatabaseId">;
    readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
    readonly catalogVersion: string & import("effect/Brand").Brand<"CatalogVersion">;
    readonly schemaFingerprint: string & import("effect/Brand").Brand<"SchemaFingerprint">;
}, template: {
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
        readonly expr: RelativeAuthorizationExpr;
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
}) => Effect.Effect<{
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
        readonly expr: CanonicalAuthorizationExpr;
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
}, BindFailure, AuthoritativeCatalog>;
export {};
//# sourceMappingURL=bind.d.ts.map