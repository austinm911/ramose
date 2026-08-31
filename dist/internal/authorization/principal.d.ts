import * as Schema from "effect/Schema";
import { JsonValue } from "./json.ts";
export declare const ClaimScalarType: Schema.Literals<readonly ["string", "long", "double", "boolean"]>;
export type ClaimScalarType = typeof ClaimScalarType.Type;
export declare const ClaimScalarShape: Schema.TaggedStruct<"scalar", {
    readonly valueType: Schema.Literals<readonly ["string", "long", "double", "boolean"]>;
}>;
export type ClaimScalarShape = typeof ClaimScalarShape.Type;
export declare const ClaimArrayShape: Schema.TaggedStruct<"array", {
    readonly items: Schema.TaggedStruct<"scalar", {
        readonly valueType: Schema.Literals<readonly ["string", "long", "double", "boolean"]>;
    }>;
}>;
export type ClaimArrayShape = typeof ClaimArrayShape.Type;
export declare const ClaimShape: Schema.Union<readonly [Schema.TaggedStruct<"scalar", {
    readonly valueType: Schema.Literals<readonly ["string", "long", "double", "boolean"]>;
}>, Schema.TaggedStruct<"array", {
    readonly items: Schema.TaggedStruct<"scalar", {
        readonly valueType: Schema.Literals<readonly ["string", "long", "double", "boolean"]>;
    }>;
}>]>;
export type ClaimShape = typeof ClaimShape.Type;
export declare const ClaimDescriptor: Schema.Struct<{
    readonly key: Schema.String;
    readonly optional: Schema.Boolean;
    readonly shape: Schema.Union<readonly [Schema.TaggedStruct<"scalar", {
        readonly valueType: Schema.Literals<readonly ["string", "long", "double", "boolean"]>;
    }>, Schema.TaggedStruct<"array", {
        readonly items: Schema.TaggedStruct<"scalar", {
            readonly valueType: Schema.Literals<readonly ["string", "long", "double", "boolean"]>;
        }>;
    }>]>;
}>;
export type ClaimDescriptor = typeof ClaimDescriptor.Type;
export declare const SubjectClaim: Schema.String;
export type SubjectClaim = typeof SubjectClaim.Type;
export declare const PrincipalResolutionConfig: Schema.Struct<{
    readonly subjectClaim: Schema.String;
    readonly entity: Schema.optionalKey<Schema.TaggedStruct<"RelativeFieldId", {
        readonly owner: Schema.Struct<{
            readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
            readonly name: Schema.String;
        }>;
        readonly localName: Schema.String;
    }>>;
}>;
export type PrincipalResolutionConfig = typeof PrincipalResolutionConfig.Type;
export declare const InstalledPrincipalResolution: Schema.Struct<{
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
export type InstalledPrincipalResolution = typeof InstalledPrincipalResolution.Type;
export declare const ApplicationEntityRef: Schema.Struct<{
    readonly entity: Schema.TaggedStruct<"EntityId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly name: Schema.String;
    }>;
    readonly eid: Schema.Finite;
}>;
export type ApplicationEntityRef = typeof ApplicationEntityRef.Type;
export declare const AuthorizationPrincipal: Schema.Struct<{
    readonly subject: Schema.String;
    readonly me: Schema.optionalKey<Schema.Struct<{
        readonly entity: Schema.TaggedStruct<"EntityId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly name: Schema.String;
        }>;
        readonly eid: Schema.Finite;
    }>>;
    readonly claims: Schema.$Record<Schema.String, Schema.Codec<JsonValue, JsonValue, never, never>>;
    readonly classes: Schema.$Array<Schema.String>;
}>;
export type AuthorizationPrincipal = typeof AuthorizationPrincipal.Type;
export declare const ClassVocabulary: Schema.$Array<Schema.String>;
export type ClassVocabulary = typeof ClassVocabulary.Type;
export declare const ClaimVocabulary: Schema.$Array<Schema.Struct<{
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
export type ClaimVocabulary = typeof ClaimVocabulary.Type;
//# sourceMappingURL=principal.d.ts.map