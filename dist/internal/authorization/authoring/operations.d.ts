import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type { AnySchema } from "../../../db/Schema.ts";
import { type DeployedSchemaCodec } from "../../../db/deployedSchema.ts";
import { type DbValueType } from "../../../db/valueTypes.ts";
import { InvalidIR } from "../failures.ts";
import { CatalogId, type DigestHex, EntityId, type OwnerRef } from "../identities.ts";
import { type OperationInputShape, type OperationWireShape, type OperationDescriptor as OperationDescriptorType } from "../catalog.ts";
import { type OperationVersionDescriptor } from "../operation-version.ts";
import type { JsonValue } from "../json.ts";
export type DeployedOperationCodec = DeployedSchemaCodec;
export type DeployedOperationRun = (op: unknown, input: unknown) => unknown | Promise<unknown>;
export type DeployedEntityRuntimeDefinition = {
    readonly ns: string;
    readonly fields: Readonly<Record<string, {
        readonly ident: string;
        readonly cardinality: "one" | "many";
        readonly valueType: DbValueType | undefined;
        readonly unique?: "upsert" | "strict";
    }>>;
};
export type DeployedOperationDefinition = {
    readonly id: OperationDescriptorType["id"];
    readonly owner: OwnerRef;
    readonly localName: string;
    readonly self: boolean;
    readonly writes: readonly EntityId[];
    readonly input: DeployedOperationCodec;
    readonly output: DeployedOperationCodec;
    readonly inputWireShape: OperationWireShape;
    readonly inputSchemaHash: DigestHex;
    readonly outputSchemaHash: DigestHex;
    readonly doc: string | undefined;
    readonly implementationHash: DigestHex;
    readonly entityDefinitions: readonly DeployedEntityRuntimeDefinition[];
    readonly run: DeployedOperationRun;
};
export type DeployedOperationBinding = {
    readonly descriptor: OperationDescriptorType;
    readonly input: DeployedOperationCodec;
    readonly output: DeployedOperationCodec;
    readonly inputWireShape: OperationWireShape;
    readonly run: DeployedOperationRun;
    readonly entityDefinitions: readonly DeployedEntityRuntimeDefinition[];
};
export type LoweredOwnedOperations = {
    readonly descriptors: readonly OperationDescriptorType[];
    readonly definitions: readonly DeployedOperationDefinition[];
};
export type OwnedOperationSnapshot = {
    readonly id: OperationDescriptorType["id"];
    readonly owner: OwnerRef;
    readonly localName: string;
    readonly self: boolean;
    readonly writes: readonly EntityId[];
    readonly composers: readonly EntityId[];
    readonly inputShape: OperationInputShape;
    readonly inputWireShape: OperationWireShape;
    readonly outputShape: OperationInputShape;
    readonly inputSchemaMaterial: JsonValue;
    readonly outputSchemaMaterial: JsonValue;
    readonly inputCodec: DeployedOperationCodec;
    readonly outputCodec: DeployedOperationCodec;
    readonly doc: string | undefined;
    readonly run: DeployedOperationRun;
    readonly implementationHashMaterial: JsonValue;
    readonly entityDefinitions: readonly DeployedEntityRuntimeDefinition[];
    readonly revision: number;
    readonly versionDescriptor: OperationVersionDescriptor;
};
export declare const pairDeployedOperations: (descriptors: readonly OperationDescriptorType[], definitions: readonly DeployedOperationDefinition[]) => Result.Result<readonly DeployedOperationBinding[], InvalidIR>;
export declare const lowerOperationSchema: (catalog: CatalogId, schema: Schema.Top, active?: ReadonlySet<Schema.Top>) => OperationInputShape;
export declare const lowerOperationWireShape: (catalog: CatalogId, schema: Schema.Top, active?: ReadonlySet<Schema.Top>) => OperationWireShape;
export declare const snapshotOwnedOperations: (catalog: CatalogId, schemas: readonly AnySchema[], artifactHash: DigestHex) => Result.Result<readonly OwnedOperationSnapshot[], InvalidIR>;
export declare const lowerOwnedOperationSnapshots: (snapshots: readonly OwnedOperationSnapshot[]) => Effect.Effect<LoweredOwnedOperations, InvalidIR, never>;
export declare const lowerOwnedOperations: (catalog: string & import("effect/Brand").Brand<"CatalogId">, input: AnySchema | readonly AnySchema[], artifactHash: string) => Effect.Effect<LoweredOwnedOperations, InvalidIR, never>;
//# sourceMappingURL=operations.d.ts.map