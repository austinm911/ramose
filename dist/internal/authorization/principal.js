import * as Schema from "effect/Schema";
import { EntityId, FieldId, RelativeFieldId } from "./identities.js";
import { JsonValue } from "./json.js";
export const ClaimScalarType = Schema.Literals(["string", "long", "double", "boolean"]);
export const ClaimScalarShape = Schema.TaggedStruct("scalar", { valueType: ClaimScalarType });
export const ClaimArrayShape = Schema.TaggedStruct("array", { items: ClaimScalarShape });
export const ClaimShape = Schema.Union([ClaimScalarShape, ClaimArrayShape]);
const uniqueKeys = (kind) => Schema.makeFilter((fields) => {
    const seen = new Set();
    for (const field of fields) {
        if (seen.has(field.key))
            return `duplicate ${kind} key '${field.key}'`;
        seen.add(field.key);
    }
    return undefined;
});
const ClaimKey = Schema.String.check(Schema.makeFilter((key) => (key.length === 0 ? "blank claim key" : undefined)));
export const ClaimDescriptor = Schema.Struct({
    key: ClaimKey,
    optional: Schema.Boolean,
    shape: ClaimShape,
});
export const SubjectClaim = Schema.String.check(Schema.makeFilter((key) => (key.length === 0 ? "blank principal subject claim" : undefined)));
export const PrincipalResolutionConfig = Schema.Struct({
    subjectClaim: SubjectClaim,
    entity: Schema.optionalKey(RelativeFieldId),
});
export const InstalledPrincipalResolution = Schema.Struct({
    subjectClaim: SubjectClaim,
    entity: Schema.optionalKey(FieldId),
});
export const ApplicationEntityRef = Schema.Struct({
    entity: EntityId,
    eid: Schema.Finite,
});
export const AuthorizationPrincipal = Schema.Struct({
    subject: Schema.String,
    me: Schema.optionalKey(ApplicationEntityRef),
    claims: Schema.Record(Schema.String, JsonValue),
    classes: Schema.Array(Schema.String),
});
const ClassName = Schema.String.check(Schema.makeFilter((name) => (name.length === 0 ? "blank class name" : undefined)));
export const ClassVocabulary = Schema.Array(ClassName).check(Schema.makeFilter((classes) => {
    const seen = new Set();
    for (const name of classes) {
        if (seen.has(name))
            return `duplicate class '${name}'`;
        seen.add(name);
    }
    return undefined;
}));
export const ClaimVocabulary = Schema.Array(ClaimDescriptor).check(uniqueKeys("claim"));
//# sourceMappingURL=principal.js.map