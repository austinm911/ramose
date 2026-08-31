import type { AnySchema } from "../../../db/Schema.ts";
import type { PathCarrier } from "../../../db/shapes.ts";
import type { AnyEntity } from "../../../db/Entity.ts";
import type { AnyTrait } from "../../../db/Trait.ts";
import type { AnyOwnedOperation } from "../../../db/Operation.ts";
import type { JsonScalar } from "../json.ts";
import type { ClaimDescriptor } from "../principal.ts";
export declare const AUTH_PATH_TAG: "AuthPath";
export declare const READ_RULE_TAG: "ReadRule";
export declare const INVOKE_RULE_TAG: "InvokeRule";
export type AuthPathStep = {
    readonly ident: string;
    readonly localName: string;
    readonly reverse: boolean;
};
export type AuthPathLike = {
    readonly _tag: typeof AUTH_PATH_TAG;
    readonly steps: readonly AuthPathStep[];
};
export type BoxedOperand = {
    readonly _tag: "me";
} | {
    readonly _tag: "subject";
} | {
    readonly _tag: "claim";
    readonly key: string;
} | {
    readonly _tag: "lit";
    readonly value: JsonScalar;
} | {
    readonly _tag: "resource";
} | {
    readonly _tag: "path";
    readonly steps: readonly AuthPathStep[];
};
export type AuthExpr = {
    readonly _tag: "const";
    readonly value: boolean;
} | {
    readonly _tag: "hasClass";
    readonly class: string;
} | {
    readonly _tag: "and";
    readonly exprs: readonly AuthExpr[];
} | {
    readonly _tag: "or";
    readonly exprs: readonly AuthExpr[];
} | {
    readonly _tag: "not";
    readonly expr: AuthExpr;
} | {
    readonly _tag: "eq";
    readonly left: unknown;
    readonly right: unknown;
} | {
    readonly _tag: "in";
    readonly value: unknown;
    readonly collection: unknown;
};
export type AuthOperandInput = AuthPathLike | PathCarrier | BoxedOperand | JsonScalar | {
    readonly _tag: string;
};
export type ReadTarget = AnyEntity | AnyTrait | PathCarrier;
export type ReadRule = {
    readonly _tag: typeof READ_RULE_TAG;
    readonly target: ReadTarget;
    readonly kind: "allow" | "deny";
    readonly expr: AuthExpr;
};
export type InvokeRule = {
    readonly _tag: typeof INVOKE_RULE_TAG;
    readonly target: AnyOwnedOperation;
    readonly kind: "allow" | "deny";
    readonly expr: AuthExpr;
};
export type AuthorizationRule = ReadRule | InvokeRule;
export type CompileReadAuthorizationInput = {
    readonly schema: AnySchema;
    readonly rules: readonly AuthorizationRule[];
    readonly classes?: readonly string[];
    readonly claims?: readonly ClaimDescriptor[];
    readonly principal?: {
        readonly subjectClaim?: string;
        readonly entity?: PathCarrier;
    };
};
type RefTargetFields<F> = F extends {
    readonly schema: {
        readonly _target?: infer T;
    };
} ? T extends {
    readonly fields: infer Fields;
} ? Fields : {
    readonly [key: string]: unknown;
} : {
    readonly [key: string]: unknown;
};
export type FieldTargetFields<T> = T extends {
    readonly schema: {
        readonly _target?: infer Target;
    };
} ? Target extends {
    readonly fields: infer Fields;
} ? Fields : {
    readonly [key: string]: unknown;
} : {
    readonly [key: string]: unknown;
};
export type AuthPathMethods = AuthPathLike & {
    readonly eq: (rhs: AuthOperandInput) => AuthExpr;
    readonly contains: (rhs: AuthOperandInput) => AuthExpr;
};
export type AuthPathProxy<Fields = object> = AuthPathMethods & {
    readonly [K in keyof Fields]: AuthPathProxy<RefTargetFields<Fields[K]>>;
} & ((rhs: AuthOperandInput) => AuthExpr);
export declare const isAuthPath: (value: unknown) => value is AuthPathLike;
export declare const isEntityTarget: (value: unknown) => value is AnyEntity;
export declare const isTraitTarget: (value: unknown) => value is AnyTrait;
export declare const isPathCarrier: (value: unknown) => value is PathCarrier;
export declare const isJsonScalar: (value: unknown) => value is JsonScalar;
export declare const parseIdent: (ident: string) => {
    readonly ns: string;
    readonly localName: string;
} | undefined;
export declare const stepFromCarrier: (carrier: PathCarrier) => AuthPathStep;
export {};
//# sourceMappingURL=types.d.ts.map