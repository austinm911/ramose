import { DurableObject } from "cloudflare:workers";
import { type DatabaseCatalogBindings, type DeployedCatalogDefinitions } from "../authorization/index.ts";
import { type RamoseEnv } from "./env.ts";
import { type TransactorConfig } from "./host.ts";
import { type TxAck } from "./transactor.ts";
import type { RuntimeBoundaries } from "../runtime-boundaries.ts";
export type { TxAck };
export declare function configFromEnv(env: RamoseEnv): TransactorConfig;
export interface TransactorTesting {
    readonly boundaries: RuntimeBoundaries;
    readonly enabled: (env: RamoseEnv) => boolean;
    readonly reset: () => void;
    readonly handleAdmin: (request: Request, path: string, abort: (reason: string) => void, inspect: {
        readonly operationReceiptCount: () => number;
    }) => Promise<Response | undefined>;
}
declare class TransactorDOBase extends DurableObject<RamoseEnv> {
    private readonly testing?;
    private readonly core;
    private readonly databaseCatalogBindings;
    private dbName;
    constructor(ctx: DurableObjectState, env: RamoseEnv, operationCatalogs?: DeployedCatalogDefinitions, databaseCatalogBindings?: DatabaseCatalogBindings, testing?: TransactorTesting | undefined);
    private assign;
    webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void>;
    webSocketClose(ws: WebSocket, code: number): Promise<void>;
    alarm(): Promise<void>;
    fetch(request: Request): Promise<Response>;
}
export declare const createTransactorDO: (operationCatalogs: DeployedCatalogDefinitions, databaseCatalogBindings?: DatabaseCatalogBindings) => (new (ctx: DurableObjectState, env: RamoseEnv) => DurableObject<RamoseEnv>);
export declare const createTestingTransactorDO: (testing: TransactorTesting, operationCatalogs?: DeployedCatalogDefinitions, databaseCatalogBindings?: DatabaseCatalogBindings) => (new (ctx: DurableObjectState, env: RamoseEnv) => DurableObject<RamoseEnv>);
export declare class TransactorDO extends TransactorDOBase {
    constructor(ctx: DurableObjectState, env: RamoseEnv);
}
//# sourceMappingURL=transactor-do.d.ts.map