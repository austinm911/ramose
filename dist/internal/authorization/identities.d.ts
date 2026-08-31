import * as Schema from "effect/Schema";
export declare const CatalogId: Schema.brand<Schema.String, "CatalogId">;
export type CatalogId = typeof CatalogId.Type;
export declare const DatabaseId: Schema.brand<Schema.String, "DatabaseId">;
export type DatabaseId = typeof DatabaseId.Type;
export declare const CatalogVersion: Schema.brand<Schema.String, "CatalogVersion">;
export type CatalogVersion = typeof CatalogVersion.Type;
export declare const SchemaFingerprint: Schema.brand<Schema.String, "SchemaFingerprint">;
export type SchemaFingerprint = typeof SchemaFingerprint.Type;
export declare const ReadCompatibilityHash: Schema.brand<Schema.String, "ReadCompatibilityHash">;
export type ReadCompatibilityHash = typeof ReadCompatibilityHash.Type;
export declare const DigestHex: Schema.String;
export type DigestHex = typeof DigestHex.Type;
export declare const PolicyHash: Schema.brand<Schema.String, "PolicyHash">;
export type PolicyHash = typeof PolicyHash.Type;
export declare const CatalogUnitHash: Schema.brand<Schema.String, "CatalogUnitHash">;
export type CatalogUnitHash = typeof CatalogUnitHash.Type;
export declare const OperationVersion: Schema.brand<Schema.String, "OperationVersion">;
export type OperationVersion = typeof OperationVersion.Type;
export declare const RuleId: Schema.brand<Schema.String, "RuleId">;
export type RuleId = typeof RuleId.Type;
export declare const OwnerKind: Schema.Literals<readonly ["entity", "trait"]>;
export type OwnerKind = typeof OwnerKind.Type;
export declare const OwnerRef: Schema.Struct<{
    readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
    readonly name: Schema.String;
}>;
export type OwnerRef = typeof OwnerRef.Type;
export declare const OperationTarget: Schema.Literals<readonly ["required", "none"]>;
export type OperationTarget = typeof OperationTarget.Type;
export declare const RelativeEntityId: Schema.TaggedStruct<"RelativeEntityId", {
    readonly name: Schema.String;
}>;
export type RelativeEntityId = typeof RelativeEntityId.Type;
export declare const RelativeTraitId: Schema.TaggedStruct<"RelativeTraitId", {
    readonly name: Schema.String;
}>;
export type RelativeTraitId = typeof RelativeTraitId.Type;
export declare const RelativeFieldId: Schema.TaggedStruct<"RelativeFieldId", {
    readonly owner: Schema.Struct<{
        readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
        readonly name: Schema.String;
    }>;
    readonly localName: Schema.String;
}>;
export type RelativeFieldId = typeof RelativeFieldId.Type;
export declare const RelativeOperationId: Schema.TaggedStruct<"RelativeOperationId", {
    readonly owner: Schema.Struct<{
        readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
        readonly name: Schema.String;
    }>;
    readonly localName: Schema.String;
    readonly target: Schema.Literals<readonly ["required", "none"]>;
}>;
export type RelativeOperationId = typeof RelativeOperationId.Type;
export declare const EntityId: Schema.TaggedStruct<"EntityId", {
    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
    readonly name: Schema.String;
}>;
export type EntityId = typeof EntityId.Type;
export declare const TraitId: Schema.TaggedStruct<"TraitId", {
    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
    readonly name: Schema.String;
}>;
export type TraitId = typeof TraitId.Type;
export declare const FieldId: Schema.TaggedStruct<"FieldId", {
    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
    readonly owner: Schema.Struct<{
        readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
        readonly name: Schema.String;
    }>;
    readonly localName: Schema.String;
}>;
export type FieldId = typeof FieldId.Type;
export declare const OperationId: Schema.TaggedStruct<"OperationId", {
    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
    readonly owner: Schema.Struct<{
        readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
        readonly name: Schema.String;
    }>;
    readonly localName: Schema.String;
    readonly target: Schema.Literals<readonly ["required", "none"]>;
}>;
export type OperationId = typeof OperationId.Type;
export declare const CanonicalIdentity: Schema.Union<readonly [Schema.TaggedStruct<"EntityId", {
    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
    readonly name: Schema.String;
}>, Schema.TaggedStruct<"TraitId", {
    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
    readonly name: Schema.String;
}>, Schema.TaggedStruct<"FieldId", {
    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
    readonly owner: Schema.Struct<{
        readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
        readonly name: Schema.String;
    }>;
    readonly localName: Schema.String;
}>, Schema.TaggedStruct<"OperationId", {
    readonly catalog: Schema.brand<Schema.String, "CatalogId">;
    readonly owner: Schema.Struct<{
        readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
        readonly name: Schema.String;
    }>;
    readonly localName: Schema.String;
    readonly target: Schema.Literals<readonly ["required", "none"]>;
}>]>;
export type CanonicalIdentity = typeof CanonicalIdentity.Type;
export declare const RelativeIdentity: Schema.Union<readonly [Schema.TaggedStruct<"RelativeEntityId", {
    readonly name: Schema.String;
}>, Schema.TaggedStruct<"RelativeTraitId", {
    readonly name: Schema.String;
}>, Schema.TaggedStruct<"RelativeFieldId", {
    readonly owner: Schema.Struct<{
        readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
        readonly name: Schema.String;
    }>;
    readonly localName: Schema.String;
}>, Schema.TaggedStruct<"RelativeOperationId", {
    readonly owner: Schema.Struct<{
        readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
        readonly name: Schema.String;
    }>;
    readonly localName: Schema.String;
    readonly target: Schema.Literals<readonly ["required", "none"]>;
}>]>;
export type RelativeIdentity = typeof RelativeIdentity.Type;
export interface IdentitySpace {
    readonly entity: RelativeEntityId | EntityId;
    readonly trait: RelativeTraitId | TraitId;
    readonly field: RelativeFieldId | FieldId;
    readonly operation: RelativeOperationId | OperationId;
}
export interface RelativeIdentities extends IdentitySpace {
    readonly entity: RelativeEntityId;
    readonly trait: RelativeTraitId;
    readonly field: RelativeFieldId;
    readonly operation: RelativeOperationId;
}
export interface CanonicalIdentities extends IdentitySpace {
    readonly entity: EntityId;
    readonly trait: TraitId;
    readonly field: FieldId;
    readonly operation: OperationId;
}
export type AnyIdentitySchemaSpace<Entity extends Schema.Top = Schema.Top, Trait extends Schema.Top = Schema.Top, Field extends Schema.Top = Schema.Top, Operation extends Schema.Top = Schema.Top> = {
    readonly entity: Entity;
    readonly trait: Trait;
    readonly field: Field;
    readonly operation: Operation;
};
export type IdentitySchemaSpace<Entity extends Schema.Top = typeof RelativeEntityId | typeof EntityId, Trait extends Schema.Top = typeof RelativeTraitId | typeof TraitId, Field extends Schema.Top = typeof RelativeFieldId | typeof FieldId, Operation extends Schema.Top = typeof RelativeOperationId | typeof OperationId> = {
    readonly entity: Entity;
    readonly trait: Trait;
    readonly field: Field;
    readonly operation: Operation;
};
export declare const RelativeIdentitySchemas: {
    readonly entity: Schema.TaggedStruct<"RelativeEntityId", {
        readonly name: Schema.String;
    }>;
    readonly trait: Schema.TaggedStruct<"RelativeTraitId", {
        readonly name: Schema.String;
    }>;
    readonly field: Schema.TaggedStruct<"RelativeFieldId", {
        readonly owner: Schema.Struct<{
            readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
            readonly name: Schema.String;
        }>;
        readonly localName: Schema.String;
    }>;
    readonly operation: Schema.TaggedStruct<"RelativeOperationId", {
        readonly owner: Schema.Struct<{
            readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
            readonly name: Schema.String;
        }>;
        readonly localName: Schema.String;
        readonly target: Schema.Literals<readonly ["required", "none"]>;
    }>;
};
export declare const CanonicalIdentitySchemas: {
    readonly entity: Schema.TaggedStruct<"EntityId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly name: Schema.String;
    }>;
    readonly trait: Schema.TaggedStruct<"TraitId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly name: Schema.String;
    }>;
    readonly field: Schema.TaggedStruct<"FieldId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly owner: Schema.Struct<{
            readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
            readonly name: Schema.String;
        }>;
        readonly localName: Schema.String;
    }>;
    readonly operation: Schema.TaggedStruct<"OperationId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly owner: Schema.Struct<{
            readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
            readonly name: Schema.String;
        }>;
        readonly localName: Schema.String;
        readonly target: Schema.Literals<readonly ["required", "none"]>;
    }>;
};
//# sourceMappingURL=identities.d.ts.map