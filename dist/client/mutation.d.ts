import { type MutationRef } from "../db/refs.ts";
import type { IndexedDbReplicaStorage } from "../internal/replication/indexeddb.ts";
import type { ReplicaDatabaseScope } from "../internal/replication/replica-lifecycle.ts";
import type { ClientCatalog } from "./catalog.ts";
import type { ClientDatabase } from "./database.ts";
import type { ClientOperation } from "./operations.ts";
import type { MutationNamespace } from "./mutation-schema.ts";
import { ReceiptDriver } from "./receipt.ts";
export type MutationContext = {
    readonly databaseOperations: () => ReadonlyMap<string, ClientOperation>;
    readonly selfOperations: (focus: {
        readonly kind: "entity" | "trait";
        readonly name: string;
    }) => ReadonlyMap<string, ClientOperation>;
    readonly catalog: () => Promise<ClientCatalog>;
    readonly storage: () => Promise<IndexedDbReplicaStorage>;
    readonly assertLive: (operation: string) => void;
    readonly submit: (receiver: ReplicaDatabaseScope) => void;
    readonly applied: (receiver: ReplicaDatabaseScope) => void;
    readonly track: (receiver: ReplicaDatabaseScope, driver: ReceiptDriver) => void;
};
export type { DatabaseMutations, EntityMutations, MutationInput, MutationMethod, MutationNamespace, } from "./mutation-schema.ts";
export declare const mutationNamespace: (context: MutationContext, database: ClientDatabase, operations: ReadonlyMap<string, ClientOperation>, target?: MutationRef) => MutationNamespace;
//# sourceMappingURL=mutation.d.ts.map