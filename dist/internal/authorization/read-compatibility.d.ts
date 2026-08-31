import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { type CatalogDescriptor } from "./catalog.ts";
import { InvalidIR } from "./failures.ts";
import type { InstalledAuthorizationIR } from "./ir.ts";
export declare const READ_COMPATIBILITY_VERSION: 1;
export declare const GRAPH_READ_SEMANTICS_VERSION: "ramose.graph-read/v1";
export declare const ReadCompatibilityDescriptor: Schema.Struct<{
    readonly version: Schema.Literal<1>;
    readonly graphReadSemantics: Schema.Literal<"ramose.graph-read/v1">;
    readonly entities: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly traits: Schema.$Array<Schema.String>;
    }>>;
    readonly traits: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly traits: Schema.$Array<Schema.String>;
    }>>;
    readonly fields: Schema.$Array<Schema.Struct<{
        readonly owner: Schema.Struct<{
            readonly kind: Schema.Literals<readonly ["entity", "trait"]>;
            readonly name: Schema.String;
        }>;
        readonly localName: Schema.String;
        readonly cardinality: Schema.Literals<readonly ["one", "many"]>;
        readonly unique: Schema.optionalKey<Schema.Literals<readonly ["upsert", "strict"]>>;
        readonly index: Schema.Boolean;
        readonly optional: Schema.Boolean;
        readonly owned: Schema.Boolean;
        readonly valueType: Schema.Literals<readonly ["string", "long", "double", "boolean", "ref", "uuid", "instant", "bytes"]>;
        readonly refTarget: Schema.optionalKey<Schema.Union<readonly [Schema.TaggedStruct<"entity", {
            readonly name: Schema.String;
        }>, Schema.TaggedStruct<"trait", {
            readonly name: Schema.String;
        }>, Schema.TaggedStruct<"self", {}>, Schema.TaggedStruct<"untargeted", {}>]>>;
    }>>;
    readonly traitComposition: Schema.$Array<Schema.Struct<{
        readonly composer: Schema.String;
        readonly trait: Schema.String;
        readonly transitive: Schema.$Array<Schema.String>;
    }>>;
}>;
export type ReadCompatibilityDescriptor = typeof ReadCompatibilityDescriptor.Type;
export declare const readCompatibilityDescriptor: (catalog: Pick<CatalogDescriptor, "entities" | "traits" | "fields" | "traitComposition">) => Result.Result<ReadCompatibilityDescriptor, InvalidIR>;
export declare const canonicalizeReadCompatibility: (descriptor: ReadCompatibilityDescriptor) => string;
export declare const hashReadCompatibility: (catalog: Pick<{
    readonly id: string & import("effect/Brand").Brand<"CatalogId">;
    readonly database: string & import("effect/Brand").Brand<"DatabaseId">;
    readonly version: string & import("effect/Brand").Brand<"CatalogVersion">;
    readonly fingerprint: string & import("effect/Brand").Brand<"SchemaFingerprint">;
    readonly entities: readonly {
        readonly id: {
            readonly _tag: "EntityId";
            readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
            readonly name: string;
        };
        readonly traits: readonly {
            readonly _tag: "TraitId";
            readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
            readonly name: string;
        }[];
        readonly doc?: string | undefined;
    }[];
    readonly traits: readonly {
        readonly id: {
            readonly _tag: "TraitId";
            readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
            readonly name: string;
        };
        readonly traits: readonly {
            readonly _tag: "TraitId";
            readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
            readonly name: string;
        }[];
        readonly doc?: string | undefined;
    }[];
    readonly fields: readonly ({
        readonly id: {
            readonly _tag: "FieldId";
            readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
            readonly owner: {
                readonly kind: "entity" | "trait";
                readonly name: string;
            };
            readonly localName: string;
        };
        readonly cardinality: "many" | "one";
        readonly unique?: "strict" | "upsert" | undefined;
        readonly index: boolean;
        readonly optional: boolean;
        readonly owned: boolean;
        readonly doc?: string | undefined;
        readonly valueType: "boolean" | "bytes" | "double" | "instant" | "long" | "string" | "uuid";
    } | {
        readonly id: {
            readonly _tag: "FieldId";
            readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
            readonly owner: {
                readonly kind: "entity" | "trait";
                readonly name: string;
            };
            readonly localName: string;
        };
        readonly cardinality: "many" | "one";
        readonly unique?: "strict" | "upsert" | undefined;
        readonly index: boolean;
        readonly optional: boolean;
        readonly owned: boolean;
        readonly doc?: string | undefined;
        readonly valueType: "ref";
        readonly refTarget: {
            readonly _tag: "entity";
            readonly entity: {
                readonly _tag: "EntityId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly name: string;
            };
        } | {
            readonly _tag: "trait";
            readonly trait: {
                readonly _tag: "TraitId";
                readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
                readonly name: string;
            };
        } | {
            readonly _tag: "self";
        } | {
            readonly _tag: "untargeted";
        };
    })[];
    readonly operations: readonly {
        readonly id: {
            readonly _tag: "OperationId";
            readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
            readonly owner: {
                readonly kind: "entity" | "trait";
                readonly name: string;
            };
            readonly localName: string;
            readonly target: "none" | "required";
        };
        readonly input: import("./catalog.ts").OperationInputShape;
        readonly output: import("./catalog.ts").OperationInputShape;
        readonly version: string & import("effect/Brand").Brand<"OperationVersion">;
        readonly revision: number;
        readonly inputSchemaHash: string;
        readonly outputSchemaHash: string;
        readonly bodyHash: string;
        readonly composers: readonly {
            readonly _tag: "EntityId";
            readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
            readonly name: string;
        }[];
        readonly writes: readonly {
            readonly _tag: "EntityId";
            readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
            readonly name: string;
        }[];
        readonly allocations?: readonly {
            readonly slot: string;
            readonly path: readonly (string | number)[];
        }[] | undefined;
        readonly doc?: string | undefined;
    }[];
    readonly traitComposition: readonly {
        readonly composer: {
            readonly _tag: "EntityId";
            readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
            readonly name: string;
        };
        readonly trait: {
            readonly _tag: "TraitId";
            readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
            readonly name: string;
        };
        readonly transitive: readonly {
            readonly _tag: "TraitId";
            readonly catalog: string & import("effect/Brand").Brand<"CatalogId">;
            readonly name: string;
        }[];
    }[];
}, "entities" | "fields" | "traitComposition" | "traits">) => Effect.Effect<string & import("effect/Brand").Brand<"ReadCompatibilityHash">, InvalidIR, never>;
export declare const canonicalizeReadPolicy: (policy: InstalledAuthorizationIR) => string;
//# sourceMappingURL=read-compatibility.d.ts.map