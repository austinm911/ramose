import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { InvalidIR } from "../failures.ts";
import type { PolicyTemplateIR } from "../ir.ts";
import type { RelativeAuthorizationExpr } from "../expr.ts";
import { type CompileReadAuthorizationInput } from "./types.ts";
export declare const compileReadAuthorizationResult: (input: CompileReadAuthorizationInput) => Result.Result<PolicyTemplateIR, InvalidIR>;
export declare const compileReadAuthorization: (input: CompileReadAuthorizationInput) => Effect.Effect<{
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
}, InvalidIR, never>;
//# sourceMappingURL=compile.d.ts.map