import { type Datom, type DatomValue, type ValueTag as VT } from "../core/datom.ts";
import { type AttributeSpec, type Cardinality, Schema, type Uniqueness } from "../core/schema.ts";
import type { LogicalDatom, LogicalValue } from "./protocol.ts";
export declare const REPLICA_USER_T = 2;
export type ReplicaAttributeSpec = {
    readonly ident: string;
    readonly valueType: VT;
    readonly cardinality: Cardinality;
    readonly index: boolean;
    readonly isComponent: boolean;
    readonly optional: boolean;
    readonly unique?: Uniqueness;
};
export declare const replicaBootstrapDatoms: () => Datom[];
export declare const replicaAttributeDatoms: (e: number, spec: ReplicaAttributeSpec, t: number) => Datom[];
export declare const replicaAttributes: (attributes: readonly AttributeSpec[]) => readonly ReplicaAttributeSpec[];
export declare const sameReplicaAttributes: (left: readonly ReplicaAttributeSpec[], right: readonly ReplicaAttributeSpec[]) => boolean;
export declare const replicaValueTag: (value: LogicalValue) => VT;
export declare const replicaDatomValue: (value: LogicalValue, entities: ReadonlyMap<string, number>) => DatomValue | undefined;
export type ReplicaFactRefusal = "unknown-entity" | "unknown-field" | "value-type";
export declare const replicaFactDatom: (logical: LogicalDatom, schema: Schema, entities: ReadonlyMap<string, number>) => Datom | ReplicaFactRefusal;
export declare const replicaSchemaDatoms: (attributes: readonly ReplicaAttributeSpec[], attributeIds: ReadonlyMap<string, number>) => Datom[] | undefined;
export declare const replicaSchema: (attributes: readonly ReplicaAttributeSpec[], attributeIds: ReadonlyMap<string, number>) => {
    readonly schema: Schema;
    readonly datoms: readonly Datom[];
} | undefined;
//# sourceMappingURL=replica-schema.d.ts.map