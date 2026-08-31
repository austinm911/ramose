import { type AnyOptimisticProjection } from "../../db/Projection.ts";
import type { QueuedOperation } from "./outbox.ts";
export type ProjectionIdentity = {
    readonly revision: number;
    readonly build: string;
};
export type ProjectionDriftReason = "operation-missing" | "projection-missing" | "projection-revision";
export type ProjectionBinding = {
    readonly type: "none";
} | {
    readonly type: "bound";
    readonly identity: ProjectionIdentity;
    readonly rebound: boolean;
    readonly run: AnyOptimisticProjection;
} | {
    readonly type: "update-required";
    readonly reason: ProjectionDriftReason;
};
export type InstalledProjection = {
    readonly operation: QueuedOperation;
    readonly projection: {
        readonly revision: number;
        readonly run: AnyOptimisticProjection;
    } | undefined;
};
export type ClientProjectionCatalog = {
    readonly build: string;
    readonly entries: ReadonlyMap<string, InstalledProjection>;
};
export declare const projectionOperationKey: (operation: QueuedOperation) => string;
export declare const projectionBuild: (value: unknown) => string;
export declare const projectionIdentity: (build: unknown, revision?: unknown) => ProjectionIdentity;
export declare const makeClientProjectionCatalog: (build: string, installed: readonly InstalledProjection[]) => ClientProjectionCatalog;
export type StoredProjection = {
    readonly operation: QueuedOperation;
    readonly projection: ProjectionIdentity | null;
};
export declare const resolveProjectionBinding: (catalog: ClientProjectionCatalog, stored: StoredProjection) => ProjectionBinding;
//# sourceMappingURL=projection-binding.d.ts.map