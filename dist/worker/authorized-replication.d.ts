import * as Effect from "effect/Effect";
import type { RamoseEnv } from "../RamoseEnv.ts";
import { type AuthenticatedCaller, type AuthorizedGraphPathTarget, type DatabaseCatalogBindings, type ResolvedDatabaseRoute } from "../internal/authorization/index.ts";
import type { RuntimeBoundaries } from "../internal/runtime-boundaries.ts";
import { type ActivationRequest } from "../internal/replication/index.ts";
import { JwtVerifier } from "./jwt.ts";
export type AuthorizedReplicationInput = {
    readonly activation: ActivationRequest;
    readonly env: RamoseEnv;
    readonly request: Request;
    readonly bindings: DatabaseCatalogBindings;
    readonly root: ResolvedDatabaseRoute;
    readonly initialCaller: AuthenticatedCaller;
    readonly initialTarget: AuthorizedGraphPathTarget;
    readonly headers: Record<string, string>;
    readonly boundaries?: RuntimeBoundaries;
};
export declare const authorizedReplicationResponse: (input: AuthorizedReplicationInput) => Effect.Effect<Response, unknown, JwtVerifier>;
export declare const incompatibleReplicationResponse: (headers: Record<string, string>) => Response;
export declare const updateRequiredReplicationResponse: (headers: Record<string, string>) => Response;
//# sourceMappingURL=authorized-replication.d.ts.map