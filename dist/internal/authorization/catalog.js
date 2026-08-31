import * as Schema from "effect/Schema";
import { CatalogId, CatalogVersion, DatabaseId, DigestHex, EntityId, FieldId, OperationId, OperationVersion, RuleId, SchemaFingerprint, TraitId, } from "./identities.js";
export const AuthorizationValueType = Schema.Literals([
    "string",
    "long",
    "double",
    "boolean",
    "ref",
    "uuid",
    "instant",
    "bytes",
]);
export const ScalarValueType = Schema.Literals([
    "string",
    "long",
    "double",
    "boolean",
    "uuid",
    "instant",
    "bytes",
]);
export const FieldCardinality = Schema.Literals(["one", "many"]);
export const FieldUniqueness = Schema.Literals(["upsert", "strict"]);
export const EntityDescriptor = Schema.Struct({
    id: EntityId,
    traits: Schema.Array(TraitId),
    doc: Schema.optionalKey(Schema.String),
});
export const TraitDescriptor = Schema.Struct({
    id: TraitId,
    traits: Schema.Array(TraitId),
    doc: Schema.optionalKey(Schema.String),
});
export const FieldRefTarget = Schema.Union([
    Schema.TaggedStruct("entity", { entity: EntityId }),
    Schema.TaggedStruct("trait", { trait: TraitId }),
    Schema.TaggedStruct("self", {}),
    Schema.TaggedStruct("untargeted", {}),
]);
const FieldDescriptorBase = {
    id: FieldId,
    cardinality: FieldCardinality,
    unique: Schema.optionalKey(FieldUniqueness),
    index: Schema.Boolean,
    optional: Schema.Boolean,
    owned: Schema.Boolean,
    doc: Schema.optionalKey(Schema.String),
};
export const ScalarFieldDescriptor = Schema.Struct({
    ...FieldDescriptorBase,
    valueType: ScalarValueType,
});
export const RefFieldDescriptor = Schema.Struct({
    ...FieldDescriptorBase,
    valueType: Schema.Literal("ref"),
    refTarget: FieldRefTarget,
});
export const FieldDescriptor = Schema.Union([ScalarFieldDescriptor, RefFieldDescriptor]);
export const OperationInputScalarShape = Schema.TaggedStruct("scalar", { valueType: ScalarValueType });
export const OperationInputRefShape = Schema.TaggedStruct("ref", { refTarget: FieldRefTarget });
export const OperationInputOpaqueShape = Schema.TaggedStruct("opaque", {});
const uniqueInputKeys = Schema.makeFilter((fields) => {
    const seen = new Set();
    for (const field of fields) {
        if (seen.has(field.key))
            return `duplicate operation input key '${field.key}'`;
        seen.add(field.key);
    }
    return undefined;
});
const OperationInputKey = Schema.String.check(Schema.makeFilter((key) => (key.length === 0 ? "blank operation input key" : undefined)));
export const OperationInputFieldDescriptor = Schema.Struct({
    key: OperationInputKey,
    optional: Schema.Boolean,
    shape: Schema.suspend(() => OperationInputShape),
});
export const OperationInputShape = Schema.Union([
    OperationInputScalarShape,
    OperationInputRefShape,
    Schema.TaggedStruct("struct", {
        fields: Schema.Array(OperationInputFieldDescriptor).check(uniqueInputKeys),
    }),
    Schema.TaggedStruct("array", { items: Schema.suspend(() => OperationInputShape) }),
    OperationInputOpaqueShape,
]);
export const OperationInputDescriptor = OperationInputShape;
const OperationRevision = Schema.Int.check(Schema.makeFilter((value) => value < 1 ? "operation revision must be a positive integer" : undefined));
export const AllocationSlotDescriptor = Schema.Struct({
    slot: Schema.String.check(Schema.isPattern(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)),
    path: Schema.Array(Schema.Union([Schema.String, Schema.Int])),
});
export const OperationDescriptor = Schema.Struct({
    id: OperationId,
    input: OperationInputShape,
    output: OperationInputShape,
    version: OperationVersion,
    revision: OperationRevision,
    inputSchemaHash: DigestHex,
    outputSchemaHash: DigestHex,
    bodyHash: DigestHex,
    composers: Schema.Array(EntityId),
    writes: Schema.Array(EntityId),
    allocations: Schema.optionalKey(Schema.Array(AllocationSlotDescriptor)),
    doc: Schema.optionalKey(Schema.String),
});
export const TraitComposition = Schema.Struct({
    composer: EntityId,
    trait: TraitId,
    transitive: Schema.Array(TraitId),
});
export const CatalogDescriptor = Schema.Struct({
    id: CatalogId,
    database: DatabaseId,
    version: CatalogVersion,
    fingerprint: SchemaFingerprint,
    entities: Schema.Array(EntityDescriptor),
    traits: Schema.Array(TraitDescriptor),
    fields: Schema.Array(FieldDescriptor),
    operations: Schema.Array(OperationDescriptor),
    traitComposition: Schema.Array(TraitComposition),
});
export const RuleAccessLookup = Schema.Union([
    Schema.TaggedStruct("field", { field: FieldId }),
    Schema.TaggedStruct("entity", { entity: EntityId }),
    Schema.TaggedStruct("trait", { trait: TraitId }),
    Schema.TaggedStruct("index", { field: FieldId }),
    Schema.TaggedStruct("refIndex", { field: FieldId }),
    Schema.TaggedStruct("principal", { field: FieldId }),
]);
export const RuleAccessPlan = Schema.Struct({
    rule: RuleId,
    lookups: Schema.Array(RuleAccessLookup),
});
//# sourceMappingURL=catalog.js.map