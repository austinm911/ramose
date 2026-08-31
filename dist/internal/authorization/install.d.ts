import * as Brand from "effect/Brand";
import * as Effect from "effect/Effect";
import { AuthoritativeCatalog, type BindFailure } from "./bind.ts";
import { type InstalledAuthorizationIRV2 as InstalledAuthorizationIRV2Type } from "./ir.ts";
export type InstallFailure = BindFailure;
export declare const installAuthorization: (input: {
    readonly target: {
        readonly database: string & Brand.Brand<"DatabaseId">;
        readonly catalog: string & Brand.Brand<"CatalogId">;
        readonly catalogVersion: string & Brand.Brand<"CatalogVersion">;
        readonly schemaFingerprint: string & Brand.Brand<"SchemaFingerprint">;
    };
    readonly descriptor: {
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
            readonly input: import("./catalog.ts").OperationInputShape;
            readonly output: import("./catalog.ts").OperationInputShape;
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
            readonly id: string & Brand.Brand<"RuleId">;
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
                    readonly allow: readonly (string & Brand.Brand<"RuleId">)[];
                    readonly deny: readonly (string & Brand.Brand<"RuleId">)[];
                };
            }[];
            readonly traits: readonly {
                readonly target: {
                    readonly _tag: "RelativeTraitId";
                    readonly name: string;
                };
                readonly decision: {
                    readonly allow: readonly (string & Brand.Brand<"RuleId">)[];
                    readonly deny: readonly (string & Brand.Brand<"RuleId">)[];
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
                    readonly allow: readonly (string & Brand.Brand<"RuleId">)[];
                    readonly deny: readonly (string & Brand.Brand<"RuleId">)[];
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
                    readonly allow: readonly (string & Brand.Brand<"RuleId">)[];
                    readonly deny: readonly (string & Brand.Brand<"RuleId">)[];
                };
            }[];
        };
    };
}) => Effect.Effect<InstalledAuthorizationIRV2Type, BindFailure, never>;
export declare const installAgainstAuthoritativeCatalog: (target: {
    readonly database: string & Brand.Brand<"DatabaseId">;
    readonly catalog: string & Brand.Brand<"CatalogId">;
    readonly catalogVersion: string & Brand.Brand<"CatalogVersion">;
    readonly schemaFingerprint: string & Brand.Brand<"SchemaFingerprint">;
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
        readonly id: string & Brand.Brand<"RuleId">;
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
                readonly allow: readonly (string & Brand.Brand<"RuleId">)[];
                readonly deny: readonly (string & Brand.Brand<"RuleId">)[];
            };
        }[];
        readonly traits: readonly {
            readonly target: {
                readonly _tag: "RelativeTraitId";
                readonly name: string;
            };
            readonly decision: {
                readonly allow: readonly (string & Brand.Brand<"RuleId">)[];
                readonly deny: readonly (string & Brand.Brand<"RuleId">)[];
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
                readonly allow: readonly (string & Brand.Brand<"RuleId">)[];
                readonly deny: readonly (string & Brand.Brand<"RuleId">)[];
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
                readonly allow: readonly (string & Brand.Brand<"RuleId">)[];
                readonly deny: readonly (string & Brand.Brand<"RuleId">)[];
            };
        }[];
    };
}) => Effect.Effect<InstalledAuthorizationIRV2Type, BindFailure, AuthoritativeCatalog>;
//# sourceMappingURL=install.d.ts.map