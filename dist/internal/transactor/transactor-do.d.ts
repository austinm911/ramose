/**
 * Transactor Durable Object — exactly one per logical database.
 *
 * Thin shell: adapts the DO runtime (SQLite storage, hibernating WebSockets,
 * alarms, R2 binding) to `TransactorHost` and forwards everything to the
 * runtime-agnostic `Transactor` (transactor.ts). All logic lives there and is
 * tested under Bun; this file only maps APIs.
 *
 *   GET /subscribe?from=<t>  (WebSocket upgrade) → hello / tx / root / gap frames
 *   everything else → Transactor.handleRequest
 */
import { DurableObject } from "cloudflare:workers";
import { type RamoseEnv } from "./env.ts";
import { type TransactorConfig } from "./host.ts";
import { Transactor, type TxAck } from "./transactor.ts";
export type { TxAck };
export declare function configFromEnv(env: RamoseEnv): TransactorConfig;
export declare class TransactorDO extends DurableObject<RamoseEnv> {
    private readonly core;
    private dbName;
    constructor(ctx: DurableObjectState, env: RamoseEnv);
    /** In-process access for other code running in the same isolate (tests, worker). */
    get transactor(): Transactor;
    /** Bind this object to a database name (idempotent; persisted). */
    assign(db: string): void;
    transact(db: string, tx: unknown[]): Promise<TxAck>;
    webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void>;
    webSocketClose(ws: WebSocket, code: number): Promise<void>;
    alarm(): Promise<void>;
    fetch(request: Request): Promise<Response>;
}
//# sourceMappingURL=transactor-do.d.ts.map