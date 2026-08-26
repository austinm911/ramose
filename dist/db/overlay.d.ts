/**
 * Session-client overlay: a confirmed log follower plus pending novelty
 * layers. HTTPS-only clients never construct one.
 *
 * The overlay view is the current-view store. Applying datoms (pending,
 * ack, inbound `{ op: tx }`, resync) is the notify — same step, after the
 * facts are visible to `view()`. Inbound confirmed datoms are already
 * assigned (`t`, eids) — `applyDatoms`, never `processTx`. Pending layers
 * stay off the confirmed log and are never sent to other sessions.
 */
import { type WireDatom } from "../internal/core/log.ts";
import type { Schema } from "../internal/core/schema.ts";
import * as Effect from "effect/Effect";
import type { AnySchema } from "./Schema.ts";
import { type AnyOperation, type OperationInvocation } from "./Operation.ts";
import { type DbError } from "./Errors.ts";
import type { Session } from "./session.ts";
export interface OverlayAck {
    readonly t: number;
    readonly txEid: number;
    readonly tempids: Record<string, number>;
    readonly datoms: WireDatom[];
    readonly datomCount: number;
    readonly clientTxId?: string;
}
export interface Overlay {
    /** Follow cursor: last walked `t` or snapshot dump `t`. Not max applied `t`. */
    readonly confirmedT: number;
    /**
     * Bumped in the same step as a view-visible mutation (pending, ack,
     * inbound `{ op: tx }`, resync). Live waits on this, not on a session
     * epoch snapshotted before `view()`.
     */
    readonly epoch: number;
    /** Fired after {@link epoch} moves — apply is the notify. */
    onChange(cb: () => void): () => void;
    ready(retry?: boolean): Effect.Effect<void, DbError>;
    read(op: "q" | "pull", body: Record<string, unknown>): Effect.Effect<unknown, DbError>;
    transact(tx: readonly unknown[]): Effect.Effect<OverlayAck, DbError>;
    run(args: OverlayRunArgs): Effect.Effect<OverlayOpAck, DbError>;
    handlePush(frame: Record<string, unknown>): Promise<void>;
}
export interface OverlayRunArgs {
    readonly invocation: OperationInvocation;
    readonly operation: AnyOperation;
    readonly schema: AnySchema;
    readonly principal: {
        readonly eid: number | null;
        readonly class: string;
    };
    readonly db: string;
}
export interface OverlayOpAck extends OverlayAck {
    readonly output: unknown;
    readonly clientOpId: string;
}
export interface OverlayOptions {
    readonly session: Session;
    readonly post: (tx: readonly unknown[], clientTxId: string) => Effect.Effect<unknown, DbError>;
    /** Required for `overlay.run`. Transact-only tests may omit it. */
    readonly postOp?: (invocation: OperationInvocation) => Effect.Effect<unknown, DbError>;
    /** Installs catalog attrs locally so processTx / q can resolve idents. */
    readonly schema?: AnySchema | undefined;
}
/** @internal Pending-layer tempid rewrite. Tests pin `:db/update`. */
export declare const rewritePendingTx: (tx: readonly unknown[], ids: Record<string, number>, schema: Schema | undefined) => unknown[];
export declare const openOverlay: (options: OverlayOptions) => Overlay;
//# sourceMappingURL=overlay.d.ts.map