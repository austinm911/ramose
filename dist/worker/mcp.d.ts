import * as Effect from "effect/Effect";
import { type AuthenticatedCaller, type ResolvedDatabaseRoute, type DatabaseCatalogBindings } from "../internal/authorization/index.ts";
import type { RamoseEnv } from "../RamoseEnv.ts";
import type { RuntimeBoundaries } from "../internal/runtime-boundaries.ts";
import { Internal } from "./errors.ts";
export type McpRouteInput = {
    readonly env: RamoseEnv;
    readonly request: Request;
    readonly bindings: DatabaseCatalogBindings;
    readonly root: ResolvedDatabaseRoute;
    readonly caller: AuthenticatedCaller;
    readonly headers: Record<string, string>;
    readonly boundaries?: RuntimeBoundaries;
};
export declare const mcpResponse: (input: McpRouteInput) => Effect.Effect<Response, Internal>;
//# sourceMappingURL=mcp.d.ts.map