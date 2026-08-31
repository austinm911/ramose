import { Db } from "../core/db.ts";
import { type ClientRef, type EntityId, type InvocationId } from "../../db/refs.ts";
import type { OverlayLayers } from "./overlay-layers.ts";
export type OverlayResolver = {
    readonly entity: (id: EntityId) => number | undefined;
    readonly mapping: (ref: ClientRef) => EntityId | undefined;
};
export type OverlayOperationRefusalReason = "unknown-field" | "value-type" | "unknown-entity" | "undeclared-ref";
export type OverlayRefusal = {
    readonly invocation: InvocationId;
    readonly index: number;
    readonly reason: OverlayOperationRefusalReason;
};
export type OverlayView = {
    readonly db: Db;
    readonly speculative: ReadonlyMap<string, number>;
    readonly refusals: readonly OverlayRefusal[];
};
export declare const projectOverlay: (committed: Db, layers: OverlayLayers, resolver: OverlayResolver) => Promise<OverlayView>;
//# sourceMappingURL=overlay.d.ts.map