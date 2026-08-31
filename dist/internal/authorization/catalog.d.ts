import * as Schema from "effect/Schema";
export declare const AuthorizationValueType: Schema.Literals<readonly ["string", "long", "double", "boolean", "ref", "uuid", "instant", "bytes"]>;
export type AuthorizationValueType = typeof AuthorizationValueType.Type;
export declare const ScalarValueType: Schema.Literals<readonly ["string", "long", "double", "boolean", "uuid", "instant", "bytes"]>;
export type ScalarValueType = typeof ScalarValueType.Type;
export declare const FieldCardinality: Schema.Literals<readonly ["one", "many"]>;
export type FieldCardinality = typeof FieldCardinality.Type;
export declare const FieldUniqueness: Schema.Literals<readonly ["upsert", "strict"]>;
export type FieldUniqueness = typeof FieldUniqueness.Type;
export declare const EntityDescriptor: Schema.Struct<{
    readonly id: Schema.TaggedStruct<"EntityId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly name: Schema.String;
    }>;
    readonly traits: Schema.$Array<Schema.TaggedStruct<"TraitId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly name: Schema.String;
    }>>;
    readonly doc: Schema.optionalKey<Schema.String>;
}>;
export type EntityDescriptor = typeof EntityDescriptor.Type;
export declare const TraitDescriptor: Schema.Struct<{
    readonly id: Schema.TaggedStruct<"TraitId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly name: Schema.String;
    }>;
    readonly traits: Schema.$Array<Schema.TaggedStruct<"TraitId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly name: Schema.String;
    }>>;
    readonly doc: Schema.optionalKey<Schema.String>;
}>;
export type TraitDescriptor = typeof TraitDescriptor.Type;
export declare const FieldRefTarget: Schema.Union<readonly [Schema.TaggedStruct<"entity", {
    readonly entity: Schema.TaggedStruct<"EntityId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly name: Schema.String;
    }>;
}>, Schema.TaggedStruct<"trait", {
    readonly trait: Schema.TaggedStruct<"TraitId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly name: Schema.String;
    }>;
}>, Schema.TaggedStruct<"self", {}>, Schema.TaggedStruct<"untargeted", {}>]>;
export type FieldRefTarget = typeof FieldRefTarget.Type;
export declare const ScalarFieldDescriptor: Schema.Struct<{
    readonly id: Schema.TaggedStruct<"FieldId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly owner: Schema.Struct<{
            readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
            readonly name: Schema.String;
        }>;
        readonly localName: Schema.String;
    }>;
    readonly cardinality: Schema.Literals<readonly ["one", "many"]>;
    readonly unique: Schema.optionalKey<Schema.Literals<readonly ["upsert", "strict"]>>;
    readonly index: Schema.Boolean;
    readonly optional: Schema.Boolean;
    readonly owned: Schema.Boolean;
    readonly doc: Schema.optionalKey<Schema.String>;
    readonly valueType: Schema.Literals<readonly ["string", "long", "double", "boolean", "uuid", "instant", "bytes"]>;
}>;
export type ScalarFieldDescriptor = typeof ScalarFieldDescriptor.Type;
export declare const RefFieldDescriptor: Schema.Struct<{
    readonly id: Schema.TaggedStruct<"FieldId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly owner: Schema.Struct<{
            readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
            readonly name: Schema.String;
        }>;
        readonly localName: Schema.String;
    }>;
    readonly cardinality: Schema.Literals<readonly ["one", "many"]>;
    readonly unique: Schema.optionalKey<Schema.Literals<readonly ["upsert", "strict"]>>;
    readonly index: Schema.Boolean;
    readonly optional: Schema.Boolean;
    readonly owned: Schema.Boolean;
    readonly doc: Schema.optionalKey<Schema.String>;
    readonly valueType: Schema.Literal<"ref">;
    readonly refTarget: Schema.Union<readonly [Schema.TaggedStruct<"entity", {
        readonly entity: Schema.TaggedStruct<"EntityId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly name: Schema.String;
        }>;
    }>, Schema.TaggedStruct<"trait", {
        readonly trait: Schema.TaggedStruct<"TraitId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly name: Schema.String;
        }>;
    }>, Schema.TaggedStruct<"self", {}>, Schema.TaggedStruct<"untargeted", {}>]>;
}>;
export type RefFieldDescriptor = typeof RefFieldDescriptor.Type;
export declare const FieldDescriptor: Schema.Union<readonly [Schema.Struct<{
    readonly id: Schema.TaggedStruct<"FieldId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly owner: Schema.Struct<{
            readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
            readonly name: Schema.String;
        }>;
        readonly localName: Schema.String;
    }>;
    readonly cardinality: Schema.Literals<readonly ["one", "many"]>;
    readonly unique: Schema.optionalKey<Schema.Literals<readonly ["upsert", "strict"]>>;
    readonly index: Schema.Boolean;
    readonly optional: Schema.Boolean;
    readonly owned: Schema.Boolean;
    readonly doc: Schema.optionalKey<Schema.String>;
    readonly valueType: Schema.Literals<readonly ["string", "long", "double", "boolean", "uuid", "instant", "bytes"]>;
}>, Schema.Struct<{
    readonly id: Schema.TaggedStruct<"FieldId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly owner: Schema.Struct<{
            readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
            readonly name: Schema.String;
        }>;
        readonly localName: Schema.String;
    }>;
    readonly cardinality: Schema.Literals<readonly ["one", "many"]>;
    readonly unique: Schema.optionalKey<Schema.Literals<readonly ["upsert", "strict"]>>;
    readonly index: Schema.Boolean;
    readonly optional: Schema.Boolean;
    readonly owned: Schema.Boolean;
    readonly doc: Schema.optionalKey<Schema.String>;
    readonly valueType: Schema.Literal<"ref">;
    readonly refTarget: Schema.Union<readonly [Schema.TaggedStruct<"entity", {
        readonly entity: Schema.TaggedStruct<"EntityId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly name: Schema.String;
        }>;
    }>, Schema.TaggedStruct<"trait", {
        readonly trait: Schema.TaggedStruct<"TraitId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly name: Schema.String;
        }>;
    }>, Schema.TaggedStruct<"self", {}>, Schema.TaggedStruct<"untargeted", {}>]>;
}>]>;
export type FieldDescriptor = typeof FieldDescriptor.Type;
export declare const OperationInputScalarShape: Schema.TaggedStruct<"scalar", {
    readonly valueType: Schema.Literals<readonly ["string", "long", "double", "boolean", "uuid", "instant", "bytes"]>;
}>;
export type OperationInputScalarShape = typeof OperationInputScalarShape.Type;
export declare const OperationInputRefShape: Schema.TaggedStruct<"ref", {
    readonly refTarget: Schema.Union<readonly [Schema.TaggedStruct<"entity", {
        readonly entity: Schema.TaggedStruct<"EntityId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly name: Schema.String;
        }>;
    }>, Schema.TaggedStruct<"trait", {
        readonly trait: Schema.TaggedStruct<"TraitId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly name: Schema.String;
        }>;
    }>, Schema.TaggedStruct<"self", {}>, Schema.TaggedStruct<"untargeted", {}>]>;
}>;
export type OperationInputRefShape = typeof OperationInputRefShape.Type;
export declare const OperationInputOpaqueShape: Schema.TaggedStruct<"opaque", {}>;
export type OperationInputOpaqueShape = typeof OperationInputOpaqueShape.Type;
export type OperationInputFieldDescriptor = {
    readonly key: string;
    readonly optional: boolean;
    readonly shape: OperationInputShape;
};
export type OperationInputShape = OperationInputScalarShape | OperationInputRefShape | OperationInputOpaqueShape | {
    readonly _tag: "struct";
    readonly fields: ReadonlyArray<OperationInputFieldDescriptor>;
} | {
    readonly _tag: "array";
    readonly items: OperationInputShape;
};
export type OperationInputFieldDescriptorEncoded = {
    readonly key: string;
    readonly optional: boolean;
    readonly shape: OperationInputShapeEncoded;
};
export type OperationInputShapeEncoded = typeof OperationInputScalarShape.Encoded | typeof OperationInputRefShape.Encoded | typeof OperationInputOpaqueShape.Encoded | {
    readonly _tag: "struct";
    readonly fields: ReadonlyArray<OperationInputFieldDescriptorEncoded>;
} | {
    readonly _tag: "array";
    readonly items: OperationInputShapeEncoded;
};
export type OperationWireFieldShape = {
    readonly key: string;
    readonly shape: OperationWireShape;
};
export type OperationWireShape = {
    readonly _tag: "scalar";
} | {
    readonly _tag: "ref";
} | {
    readonly _tag: "opaque";
} | {
    readonly _tag: "struct";
    readonly fields: ReadonlyArray<OperationWireFieldShape>;
} | {
    readonly _tag: "array";
    readonly items: OperationWireShape;
};
export declare const OperationInputFieldDescriptor: Schema.Codec<OperationInputFieldDescriptor, OperationInputFieldDescriptorEncoded>;
export declare const OperationInputShape: Schema.Codec<OperationInputShape, OperationInputShapeEncoded>;
export declare const OperationInputDescriptor: Schema.Codec<OperationInputShape, OperationInputShapeEncoded, never, never>;
export type OperationInputDescriptor = OperationInputShape;
export declare const AllocationSlotDescriptor: Schema.Struct<{
    readonly slot: Schema.String;
    readonly path: Schema.$Array<Schema.Union<readonly [Schema.String, Schema.Int]>>;
}>;
export type AllocationSlotDescriptor = typeof AllocationSlotDescriptor.Type;
export declare const OperationDescriptor: Schema.Struct<{
    readonly id: Schema.TaggedStruct<"OperationId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly owner: Schema.Struct<{
            readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
            readonly name: Schema.String;
        }>;
        readonly localName: Schema.String;
        readonly target: Schema.Literals<readonly ["required", "none"]>;
    }>;
    readonly input: Schema.Codec<OperationInputShape, OperationInputShapeEncoded, never, never>;
    readonly output: Schema.Codec<OperationInputShape, OperationInputShapeEncoded, never, never>;
    readonly version: Schema.brand<Schema.String, "OperationVersion">;
    readonly revision: Schema.Int;
    readonly inputSchemaHash: Schema.String;
    readonly outputSchemaHash: Schema.String;
    readonly bodyHash: Schema.String;
    readonly composers: Schema.$Array<Schema.TaggedStruct<"EntityId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly name: Schema.String;
    }>>;
    readonly writes: Schema.$Array<Schema.TaggedStruct<"EntityId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly name: Schema.String;
    }>>;
    readonly allocations: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly slot: Schema.String;
        readonly path: Schema.$Array<Schema.Union<readonly [Schema.String, Schema.Int]>>;
    }>>>;
    readonly doc: Schema.optionalKey<Schema.String>;
}>;
export type OperationDescriptor = typeof OperationDescriptor.Type;
export declare const TraitComposition: Schema.Struct<{
    readonly composer: Schema.TaggedStruct<"EntityId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly name: Schema.String;
    }>;
    readonly trait: Schema.TaggedStruct<"TraitId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly name: Schema.String;
    }>;
    readonly transitive: Schema.$Array<Schema.TaggedStruct<"TraitId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly name: Schema.String;
    }>>;
}>;
export type TraitComposition = typeof TraitComposition.Type;
export declare const CatalogDescriptor: Schema.Struct<{
    readonly id: Schema.brand<Schema.String, "CatalogId">;
    readonly database: Schema.brand<Schema.String, "DatabaseId">;
    readonly version: Schema.brand<Schema.String, "CatalogVersion">;
    readonly fingerprint: Schema.brand<Schema.String, "SchemaFingerprint">;
    readonly entities: Schema.$Array<Schema.Struct<{
        readonly id: Schema.TaggedStruct<"EntityId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly name: Schema.String;
        }>;
        readonly traits: Schema.$Array<Schema.TaggedStruct<"TraitId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly name: Schema.String;
        }>>;
        readonly doc: Schema.optionalKey<Schema.String>;
    }>>;
    readonly traits: Schema.$Array<Schema.Struct<{
        readonly id: Schema.TaggedStruct<"TraitId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly name: Schema.String;
        }>;
        readonly traits: Schema.$Array<Schema.TaggedStruct<"TraitId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly name: Schema.String;
        }>>;
        readonly doc: Schema.optionalKey<Schema.String>;
    }>>;
    readonly fields: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
        readonly id: Schema.TaggedStruct<"FieldId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly owner: Schema.Struct<{
                readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                readonly name: Schema.String;
            }>;
            readonly localName: Schema.String;
        }>;
        readonly cardinality: Schema.Literals<readonly ["one", "many"]>;
        readonly unique: Schema.optionalKey<Schema.Literals<readonly ["upsert", "strict"]>>;
        readonly index: Schema.Boolean;
        readonly optional: Schema.Boolean;
        readonly owned: Schema.Boolean;
        readonly doc: Schema.optionalKey<Schema.String>;
        readonly valueType: Schema.Literals<readonly ["string", "long", "double", "boolean", "uuid", "instant", "bytes"]>;
    }>, Schema.Struct<{
        readonly id: Schema.TaggedStruct<"FieldId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly owner: Schema.Struct<{
                readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                readonly name: Schema.String;
            }>;
            readonly localName: Schema.String;
        }>;
        readonly cardinality: Schema.Literals<readonly ["one", "many"]>;
        readonly unique: Schema.optionalKey<Schema.Literals<readonly ["upsert", "strict"]>>;
        readonly index: Schema.Boolean;
        readonly optional: Schema.Boolean;
        readonly owned: Schema.Boolean;
        readonly doc: Schema.optionalKey<Schema.String>;
        readonly valueType: Schema.Literal<"ref">;
        readonly refTarget: Schema.Union<readonly [Schema.TaggedStruct<"entity", {
            readonly entity: Schema.TaggedStruct<"EntityId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly name: Schema.String;
            }>;
        }>, Schema.TaggedStruct<"trait", {
            readonly trait: Schema.TaggedStruct<"TraitId", {
                readonly catalog: Schema.brand<Schema.String, "CatalogId">;
                readonly name: Schema.String;
            }>;
        }>, Schema.TaggedStruct<"self", {}>, Schema.TaggedStruct<"untargeted", {}>]>;
    }>]>>;
    readonly operations: Schema.$Array<Schema.Struct<{
        readonly id: Schema.TaggedStruct<"OperationId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly owner: Schema.Struct<{
                readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                readonly name: Schema.String;
            }>;
            readonly localName: Schema.String;
            readonly target: Schema.Literals<readonly ["required", "none"]>;
        }>;
        readonly input: Schema.Codec<OperationInputShape, OperationInputShapeEncoded, never, never>;
        readonly output: Schema.Codec<OperationInputShape, OperationInputShapeEncoded, never, never>;
        readonly version: Schema.brand<Schema.String, "OperationVersion">;
        readonly revision: Schema.Int;
        readonly inputSchemaHash: Schema.String;
        readonly outputSchemaHash: Schema.String;
        readonly bodyHash: Schema.String;
        readonly composers: Schema.$Array<Schema.TaggedStruct<"EntityId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly name: Schema.String;
        }>>;
        readonly writes: Schema.$Array<Schema.TaggedStruct<"EntityId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly name: Schema.String;
        }>>;
        readonly allocations: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly slot: Schema.String;
            readonly path: Schema.$Array<Schema.Union<readonly [Schema.String, Schema.Int]>>;
        }>>>;
        readonly doc: Schema.optionalKey<Schema.String>;
    }>>;
    readonly traitComposition: Schema.$Array<Schema.Struct<{
        readonly composer: Schema.TaggedStruct<"EntityId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly name: Schema.String;
        }>;
        readonly trait: Schema.TaggedStruct<"TraitId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly name: Schema.String;
        }>;
        readonly transitive: Schema.$Array<Schema.TaggedStruct<"TraitId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly name: Schema.String;
        }>>;
    }>>;
}>;
export type CatalogDescriptor = typeof CatalogDescriptor.Type;
export declare const RuleAccessLookup: Schema.Union<readonly [Schema.TaggedStruct<"field", {
    readonly field: Schema.TaggedStruct<"FieldId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly owner: Schema.Struct<{
            readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
            readonly name: Schema.String;
        }>;
        readonly localName: Schema.String;
    }>;
}>, Schema.TaggedStruct<"entity", {
    readonly entity: Schema.TaggedStruct<"EntityId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly name: Schema.String;
    }>;
}>, Schema.TaggedStruct<"trait", {
    readonly trait: Schema.TaggedStruct<"TraitId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly name: Schema.String;
    }>;
}>, Schema.TaggedStruct<"index", {
    readonly field: Schema.TaggedStruct<"FieldId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly owner: Schema.Struct<{
            readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
            readonly name: Schema.String;
        }>;
        readonly localName: Schema.String;
    }>;
}>, Schema.TaggedStruct<"refIndex", {
    readonly field: Schema.TaggedStruct<"FieldId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly owner: Schema.Struct<{
            readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
            readonly name: Schema.String;
        }>;
        readonly localName: Schema.String;
    }>;
}>, Schema.TaggedStruct<"principal", {
    readonly field: Schema.TaggedStruct<"FieldId", {
        readonly catalog: Schema.brand<Schema.String, "CatalogId">;
        readonly owner: Schema.Struct<{
            readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
            readonly name: Schema.String;
        }>;
        readonly localName: Schema.String;
    }>;
}>]>;
export type RuleAccessLookup = typeof RuleAccessLookup.Type;
export declare const RuleAccessPlan: Schema.Struct<{
    readonly rule: Schema.brand<Schema.String, "RuleId">;
    readonly lookups: Schema.$Array<Schema.Union<readonly [Schema.TaggedStruct<"field", {
        readonly field: Schema.TaggedStruct<"FieldId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly owner: Schema.Struct<{
                readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                readonly name: Schema.String;
            }>;
            readonly localName: Schema.String;
        }>;
    }>, Schema.TaggedStruct<"entity", {
        readonly entity: Schema.TaggedStruct<"EntityId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly name: Schema.String;
        }>;
    }>, Schema.TaggedStruct<"trait", {
        readonly trait: Schema.TaggedStruct<"TraitId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly name: Schema.String;
        }>;
    }>, Schema.TaggedStruct<"index", {
        readonly field: Schema.TaggedStruct<"FieldId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly owner: Schema.Struct<{
                readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                readonly name: Schema.String;
            }>;
            readonly localName: Schema.String;
        }>;
    }>, Schema.TaggedStruct<"refIndex", {
        readonly field: Schema.TaggedStruct<"FieldId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly owner: Schema.Struct<{
                readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                readonly name: Schema.String;
            }>;
            readonly localName: Schema.String;
        }>;
    }>, Schema.TaggedStruct<"principal", {
        readonly field: Schema.TaggedStruct<"FieldId", {
            readonly catalog: Schema.brand<Schema.String, "CatalogId">;
            readonly owner: Schema.Struct<{
                readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
                readonly name: Schema.String;
            }>;
            readonly localName: Schema.String;
        }>;
    }>]>>;
}>;
export type RuleAccessPlan = typeof RuleAccessPlan.Type;
//# sourceMappingURL=catalog.d.ts.map