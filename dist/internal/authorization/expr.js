import * as Schema from "effect/Schema";
import { CanonicalIdentitySchemas, RelativeIdentitySchemas, } from "./identities.js";
import { JsonScalar } from "./json.js";
export const PathRoot = Schema.Union([
    Schema.TaggedStruct("resource", {}),
    Schema.TaggedStruct("me", {}),
]);
export const PathStep = (field) => Schema.Struct({ field });
export const RefTerm = (field) => Schema.TaggedStruct("ref", {
    root: PathRoot,
    steps: Schema.Array(PathStep(field)),
});
export const LitTerm = Schema.TaggedStruct("lit", {
    value: JsonScalar,
});
export const SubjectTerm = Schema.TaggedStruct("subject", {});
export const MeTerm = Schema.TaggedStruct("me", {});
export const ClaimTerm = Schema.TaggedStruct("claim", {
    key: Schema.String,
});
export const ValueTerm = (field) => Schema.Union([LitTerm, SubjectTerm, MeTerm, ClaimTerm, RefTerm(field)]);
export const ConstExpr = Schema.TaggedStruct("const", {
    value: Schema.Boolean,
});
export const HasClassExpr = Schema.TaggedStruct("hasClass", {
    class: Schema.String,
});
export const AndExpr = (expr) => Schema.TaggedStruct("and", { exprs: Schema.Array(expr) });
export const OrExpr = (expr) => Schema.TaggedStruct("or", { exprs: Schema.Array(expr) });
export const NotExpr = (expr) => Schema.TaggedStruct("not", { expr });
export const EqExpr = (value) => Schema.TaggedStruct("eq", { left: value, right: value });
export const HasExpr = (value) => Schema.TaggedStruct("has", { term: value });
export const InExpr = (value) => Schema.TaggedStruct("in", { value, collection: value });
export const RelativePathStep = PathStep(RelativeIdentitySchemas.field);
export const CanonicalPathStep = PathStep(CanonicalIdentitySchemas.field);
export const RelativeRefTerm = RefTerm(RelativeIdentitySchemas.field);
export const CanonicalRefTerm = RefTerm(CanonicalIdentitySchemas.field);
export const RelativeValueTerm = ValueTerm(RelativeIdentitySchemas.field);
export const CanonicalValueTerm = ValueTerm(CanonicalIdentitySchemas.field);
const authorizationExprUnion = (ids, expr) => {
    const value = ValueTerm(ids.field);
    return Schema.Union([
        ConstExpr,
        AndExpr(expr),
        OrExpr(expr),
        NotExpr(expr),
        EqExpr(value),
        HasExpr(value),
        InExpr(value),
        HasClassExpr,
    ]);
};
export const RelativeAuthorizationExpr = Schema.suspend(() => authorizationExprUnion(RelativeIdentitySchemas, RelativeAuthorizationExpr));
export const CanonicalAuthorizationExpr = Schema.suspend(() => authorizationExprUnion(CanonicalIdentitySchemas, CanonicalAuthorizationExpr));
//# sourceMappingURL=expr.js.map