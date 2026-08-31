import type { RamoseEnv } from "../RamoseEnv.ts";
import type { RuntimeBoundaries } from "../internal/runtime-boundaries.ts";
import * as Effect from "effect/Effect";
import { type Route } from "./analytics.ts";
import { type RamoseError } from "./errors.ts";
import { JwtVerifier } from "./jwt.ts";
import { type OperationCatalogs } from "./operation-catalogs.ts";
export interface ServerOptions {
    readonly operationCatalogs?: OperationCatalogs;
}
export interface RequestInfo {
    db: string;
    path: string;
    route: Route;
}
export declare const respond: (err: RamoseError, request?: Request, env?: RamoseEnv) => Response;
export declare const handle: (request: Request, env: RamoseEnv, t0: number, info: RequestInfo, peer: ServerOptions, boundaries?: RuntimeBoundaries) => Effect.Effect<Response, RamoseError, JwtVerifier>;
export declare const runFetch: (request: Request, env: RamoseEnv, peer: ServerOptions, boundaries?: RuntimeBoundaries) => Promise<Response>;
//# sourceMappingURL=handle.d.ts.map