import * as Schema from "effect/Schema";
import { type CanonicalIdentities, type IdentitySpace, type RelativeIdentities } from "./identities.ts";
export declare const PathRoot: Schema.Union<readonly [Schema.TaggedStruct<"resource", {}>, Schema.TaggedStruct<"me", {}>]>;
export type PathRoot = typeof PathRoot.Type;
export declare const PathStep: <F extends Schema.Top>(field: F) => Schema.Struct<{
    readonly field: F;
}>;
export declare const RefTerm: <F extends Schema.Top>(field: F) => Schema.TaggedStruct<"ref", {
    readonly root: Schema.Union<readonly [Schema.TaggedStruct<"resource", {}>, Schema.TaggedStruct<"me", {}>]>;
    readonly steps: Schema.$Array<Schema.Struct<{
        readonly field: F;
    }>>;
}>;
export declare const LitTerm: Schema.TaggedStruct<"lit", {
    readonly value: Schema.Union<readonly [Schema.String, Schema.Finite, Schema.Boolean, Schema.Null]>;
}>;
export type LitTerm = typeof LitTerm.Type;
export declare const SubjectTerm: Schema.TaggedStruct<"subject", {}>;
export type SubjectTerm = typeof SubjectTerm.Type;
export declare const MeTerm: Schema.TaggedStruct<"me", {}>;
export type MeTerm = typeof MeTerm.Type;
export declare const ClaimTerm: Schema.TaggedStruct<"claim", {
    readonly key: Schema.String;
}>;
export type ClaimTerm = typeof ClaimTerm.Type;
export declare const ValueTerm: <F extends Schema.Top>(field: F) => Schema.Union<readonly [Schema.TaggedStruct<"lit", {
    readonly value: Schema.Union<readonly [Schema.String, Schema.Finite, Schema.Boolean, Schema.Null]>;
}>, Schema.TaggedStruct<"subject", {}>, Schema.TaggedStruct<"me", {}>, Schema.TaggedStruct<"claim", {
    readonly key: Schema.String;
}>, Schema.TaggedStruct<"ref", {
    readonly root: Schema.Union<readonly [Schema.TaggedStruct<"resource", {}>, Schema.TaggedStruct<"me", {}>]>;
    readonly steps: Schema.$Array<Schema.Struct<{
        readonly field: F;
    }>>;
}>]>;
export declare const ConstExpr: Schema.TaggedStruct<"const", {
    readonly value: Schema.Boolean;
}>;
export type ConstExpr = typeof ConstExpr.Type;
export declare const HasClassExpr: Schema.TaggedStruct<"hasClass", {
    readonly class: Schema.String;
}>;
export type HasClassExpr = typeof HasClassExpr.Type;
export declare const AndExpr: <E extends Schema.Top>(expr: E) => Schema.TaggedStruct<"and", {
    readonly exprs: Schema.$Array<E>;
}>;
export declare const OrExpr: <E extends Schema.Top>(expr: E) => Schema.TaggedStruct<"or", {
    readonly exprs: Schema.$Array<E>;
}>;
export declare const NotExpr: <E extends Schema.Top>(expr: E) => Schema.TaggedStruct<"not", {
    readonly expr: E;
}>;
export declare const EqExpr: <V extends Schema.Top>(value: V) => Schema.TaggedStruct<"eq", {
    readonly left: V;
    readonly right: V;
}>;
export declare const HasExpr: <V extends Schema.Top>(value: V) => Schema.TaggedStruct<"has", {
    readonly term: V;
}>;
export declare const InExpr: <V extends Schema.Top>(value: V) => Schema.TaggedStruct<"in", {
    readonly value: V;
    readonly collection: V;
}>;
export declare const RelativePathStep: Schema.Struct<{
    readonly field: Schema.TaggedStruct<"RelativeFieldId", {
        readonly owner: Schema.Struct<{
            readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
            readonly name: Schema.String;
        }>;
        readonly localName: Schema.String;
    }>;
}>;
export type RelativePathStep = typeof RelativePathStep.Type;
export declare const CanonicalPathStep: Schema.Struct<{
    readonly field: Schema.TaggedStruct<"FieldId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly owner: Schema.Struct<{
            readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
            readonly name: Schema.String;
        }>;
        readonly localName: Schema.String;
    }>;
}>;
export type CanonicalPathStep = typeof CanonicalPathStep.Type;
export declare const RelativeRefTerm: Schema.TaggedStruct<"ref", {
    readonly root: Schema.Union<readonly [Schema.TaggedStruct<"resource", {}>, Schema.TaggedStruct<"me", {}>]>;
    readonly steps: Schema.$Array<Schema.Struct<{
        readonly field: Schema.TaggedStruct<"RelativeFieldId", {
            readonly owner: Schema.Struct<{
                readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                readonly name: Schema.String;
            }>;
            readonly localName: Schema.String;
        }>;
    }>>;
}>;
export type RelativeRefTerm = typeof RelativeRefTerm.Type;
export declare const CanonicalRefTerm: Schema.TaggedStruct<"ref", {
    readonly root: Schema.Union<readonly [Schema.TaggedStruct<"resource", {}>, Schema.TaggedStruct<"me", {}>]>;
    readonly steps: Schema.$Array<Schema.Struct<{
        readonly field: Schema.TaggedStruct<"FieldId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly owner: Schema.Struct<{
                readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                readonly name: Schema.String;
            }>;
            readonly localName: Schema.String;
        }>;
    }>>;
}>;
export type CanonicalRefTerm = typeof CanonicalRefTerm.Type;
export declare const RelativeValueTerm: Schema.Union<readonly [Schema.TaggedStruct<"lit", {
    readonly value: Schema.Union<readonly [Schema.String, Schema.Finite, Schema.Boolean, Schema.Null]>;
}>, Schema.TaggedStruct<"subject", {}>, Schema.TaggedStruct<"me", {}>, Schema.TaggedStruct<"claim", {
    readonly key: Schema.String;
}>, Schema.TaggedStruct<"ref", {
    readonly root: Schema.Union<readonly [Schema.TaggedStruct<"resource", {}>, Schema.TaggedStruct<"me", {}>]>;
    readonly steps: Schema.$Array<Schema.Struct<{
        readonly field: Schema.TaggedStruct<"RelativeFieldId", {
            readonly owner: Schema.Struct<{
                readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                readonly name: Schema.String;
            }>;
            readonly localName: Schema.String;
        }>;
    }>>;
}>]>;
export type RelativeValueTerm = typeof RelativeValueTerm.Type;
export declare const CanonicalValueTerm: Schema.Union<readonly [Schema.TaggedStruct<"lit", {
    readonly value: Schema.Union<readonly [Schema.String, Schema.Finite, Schema.Boolean, Schema.Null]>;
}>, Schema.TaggedStruct<"subject", {}>, Schema.TaggedStruct<"me", {}>, Schema.TaggedStruct<"claim", {
    readonly key: Schema.String;
}>, Schema.TaggedStruct<"ref", {
    readonly root: Schema.Union<readonly [Schema.TaggedStruct<"resource", {}>, Schema.TaggedStruct<"me", {}>]>;
    readonly steps: Schema.$Array<Schema.Struct<{
        readonly field: Schema.TaggedStruct<"FieldId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly owner: Schema.Struct<{
                readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                readonly name: Schema.String;
            }>;
            readonly localName: Schema.String;
        }>;
    }>>;
}>]>;
export type CanonicalValueTerm = typeof CanonicalValueTerm.Type;
export type RelativeValueTermEncoded = typeof RelativeValueTerm.Encoded;
export type CanonicalValueTermEncoded = typeof CanonicalValueTerm.Encoded;
export type RelativeRefTermEncoded = typeof RelativeRefTerm.Encoded;
export type CanonicalRefTermEncoded = typeof CanonicalRefTerm.Encoded;
export type RelativeAuthorizationExpr = ConstExpr | HasClassExpr | {
    readonly _tag: "and";
    readonly exprs: ReadonlyArray<RelativeAuthorizationExpr>;
} | {
    readonly _tag: "or";
    readonly exprs: ReadonlyArray<RelativeAuthorizationExpr>;
} | {
    readonly _tag: "not";
    readonly expr: RelativeAuthorizationExpr;
} | {
    readonly _tag: "eq";
    readonly left: RelativeValueTerm;
    readonly right: RelativeValueTerm;
} | {
    readonly _tag: "has";
    readonly term: RelativeValueTerm;
} | {
    readonly _tag: "in";
    readonly value: RelativeValueTerm;
    readonly collection: RelativeValueTerm;
};
export type CanonicalAuthorizationExpr = ConstExpr | HasClassExpr | {
    readonly _tag: "and";
    readonly exprs: ReadonlyArray<CanonicalAuthorizationExpr>;
} | {
    readonly _tag: "or";
    readonly exprs: ReadonlyArray<CanonicalAuthorizationExpr>;
} | {
    readonly _tag: "not";
    readonly expr: CanonicalAuthorizationExpr;
} | {
    readonly _tag: "eq";
    readonly left: CanonicalValueTerm;
    readonly right: CanonicalValueTerm;
} | {
    readonly _tag: "has";
    readonly term: CanonicalValueTerm;
} | {
    readonly _tag: "in";
    readonly value: CanonicalValueTerm;
    readonly collection: CanonicalValueTerm;
};
export type RelativeAuthorizationExprEncoded = ConstExpr | HasClassExpr | {
    readonly _tag: "and";
    readonly exprs: ReadonlyArray<RelativeAuthorizationExprEncoded>;
} | {
    readonly _tag: "or";
    readonly exprs: ReadonlyArray<RelativeAuthorizationExprEncoded>;
} | {
    readonly _tag: "not";
    readonly expr: RelativeAuthorizationExprEncoded;
} | {
    readonly _tag: "eq";
    readonly left: RelativeValueTermEncoded;
    readonly right: RelativeValueTermEncoded;
} | {
    readonly _tag: "has";
    readonly term: RelativeValueTermEncoded;
} | {
    readonly _tag: "in";
    readonly value: RelativeValueTermEncoded;
    readonly collection: RelativeValueTermEncoded;
};
export type CanonicalAuthorizationExprEncoded = ConstExpr | HasClassExpr | {
    readonly _tag: "and";
    readonly exprs: ReadonlyArray<CanonicalAuthorizationExprEncoded>;
} | {
    readonly _tag: "or";
    readonly exprs: ReadonlyArray<CanonicalAuthorizationExprEncoded>;
} | {
    readonly _tag: "not";
    readonly expr: CanonicalAuthorizationExprEncoded;
} | {
    readonly _tag: "eq";
    readonly left: CanonicalValueTermEncoded;
    readonly right: CanonicalValueTermEncoded;
} | {
    readonly _tag: "has";
    readonly term: CanonicalValueTermEncoded;
} | {
    readonly _tag: "in";
    readonly value: CanonicalValueTermEncoded;
    readonly collection: CanonicalValueTermEncoded;
};
export declare const RelativeAuthorizationExpr: Schema.Codec<RelativeAuthorizationExpr, RelativeAuthorizationExprEncoded>;
export declare const CanonicalAuthorizationExpr: Schema.Codec<CanonicalAuthorizationExpr, CanonicalAuthorizationExprEncoded>;
export type PathStep<I extends IdentitySpace = RelativeIdentities> = I extends CanonicalIdentities ? CanonicalPathStep : RelativePathStep;
export type RefTerm<I extends IdentitySpace = RelativeIdentities> = I extends CanonicalIdentities ? CanonicalRefTerm : RelativeRefTerm;
export type ValueTerm<I extends IdentitySpace = RelativeIdentities> = I extends CanonicalIdentities ? CanonicalValueTerm : RelativeValueTerm;
export type AndExpr = Extract<RelativeAuthorizationExpr | CanonicalAuthorizationExpr, {
    readonly _tag: "and";
}>;
export type OrExpr = Extract<RelativeAuthorizationExpr | CanonicalAuthorizationExpr, {
    readonly _tag: "or";
}>;
export type NotExpr = Extract<RelativeAuthorizationExpr | CanonicalAuthorizationExpr, {
    readonly _tag: "not";
}>;
export type EqExpr = Extract<RelativeAuthorizationExpr | CanonicalAuthorizationExpr, {
    readonly _tag: "eq";
}>;
export type HasExpr = Extract<RelativeAuthorizationExpr | CanonicalAuthorizationExpr, {
    readonly _tag: "has";
}>;
export type InExpr = Extract<RelativeAuthorizationExpr | CanonicalAuthorizationExpr, {
    readonly _tag: "in";
}>;
export type AuthorizationExpr<I extends IdentitySpace = RelativeIdentities> = I extends CanonicalIdentities ? CanonicalAuthorizationExpr : I extends RelativeIdentities ? RelativeAuthorizationExpr : RelativeAuthorizationExpr | CanonicalAuthorizationExpr;
//# sourceMappingURL=expr.d.ts.map