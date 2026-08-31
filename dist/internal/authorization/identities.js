import * as Schema from "effect/Schema";
export const CatalogId = Schema.String.pipe(Schema.brand("CatalogId"));
export const DatabaseId = Schema.String.pipe(Schema.brand("DatabaseId"));
export const CatalogVersion = Schema.String.pipe(Schema.brand("CatalogVersion"));
export const SchemaFingerprint = Schema.String.pipe(Schema.brand("SchemaFingerprint"));
export const ReadCompatibilityHash = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/)).pipe(Schema.brand("ReadCompatibilityHash"));
export const DigestHex = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/));
export const PolicyHash = DigestHex.pipe(Schema.brand("PolicyHash"));
export const CatalogUnitHash = DigestHex.pipe(Schema.brand("CatalogUnitHash"));
export const OperationVersion = DigestHex.pipe(Schema.brand("OperationVersion"));
export const RuleId = DigestHex.pipe(Schema.brand("RuleId"));
export const OwnerKind = Schema.Literals(["entity", "trait"]);
export const OwnerRef = Schema.Struct({
    kind: OwnerKind,
    name: Schema.String,
});
export const OperationTarget = Schema.Literals(["required", "none"]);
export const RelativeEntityId = Schema.TaggedStruct("RelativeEntityId", {
    name: Schema.String,
});
export const RelativeTraitId = Schema.TaggedStruct("RelativeTraitId", {
    name: Schema.String,
});
export const RelativeFieldId = Schema.TaggedStruct("RelativeFieldId", {
    owner: OwnerRef,
    localName: Schema.String,
});
export const RelativeOperationId = Schema.TaggedStruct("RelativeOperationId", {
    owner: OwnerRef,
    localName: Schema.String,
    target: OperationTarget,
});
export const EntityId = Schema.TaggedStruct("EntityId", {
    catalog: CatalogId,
    name: Schema.String,
});
export const TraitId = Schema.TaggedStruct("TraitId", {
    catalog: CatalogId,
    name: Schema.String,
});
export const FieldId = Schema.TaggedStruct("FieldId", {
    catalog: CatalogId,
    owner: OwnerRef,
    localName: Schema.String,
});
export const OperationId = Schema.TaggedStruct("OperationId", {
    catalog: CatalogId,
    owner: OwnerRef,
    localName: Schema.String,
    target: OperationTarget,
});
export const CanonicalIdentity = Schema.Union([EntityId, TraitId, FieldId, OperationId]);
export const RelativeIdentity = Schema.Union([
    RelativeEntityId,
    RelativeTraitId,
    RelativeFieldId,
    RelativeOperationId,
]);
export const RelativeIdentitySchemas = {
    entity: RelativeEntityId,
    trait: RelativeTraitId,
    field: RelativeFieldId,
    operation: RelativeOperationId,
};
export const CanonicalIdentitySchemas = {
    entity: EntityId,
    trait: TraitId,
    field: FieldId,
    operation: OperationId,
};
//# sourceMappingURL=identities.js.map