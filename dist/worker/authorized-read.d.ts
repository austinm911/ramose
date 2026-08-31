import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { CatalogId, CatalogUnitHash, DatabaseId, type DatabaseRouteDerivation, type ResolvedDatabaseRoute, type AuthorizedRequestView, type OneShotRead } from "../internal/authorization/index.ts";
import type { EntityRef } from "../internal/core/db.ts";
import type { Db } from "../internal/core/db.ts";
import { type Basis } from "../internal/replica/basis.ts";
import type { RamoseEnv } from "../RamoseEnv.ts";
import { BadRequest, Unauthorized, type RamoseError } from "./errors.ts";
export type ParsedOneShotRead = {
    readonly read: OneShotRead;
    readonly view: AuthorizedRequestView;
    readonly path: readonly string[];
    readonly catalogKey?: CatalogId;
    readonly unitHash?: CatalogUnitHash;
};
export declare const parseCatalogProof: (body: Record<string, unknown> | undefined, headers: Headers) => Result.Result<{
    catalogKey: CatalogId;
    unitHash: CatalogUnitHash;
}, Unauthorized>;
export declare const parseGraphPath: (body: Record<string, unknown> | undefined, search: URLSearchParams) => Result.Result<readonly string[], BadRequest>;
export declare const carriesCatalogProof: (body: Record<string, unknown> | undefined, headers: Headers) => boolean;
export declare const refuseCatalogProof: (body: Record<string, unknown> | undefined, headers: Headers) => Result.Result<void, Unauthorized>;
export declare const parseCatalogProofForPath: (path: readonly string[], body: Record<string, unknown> | undefined, headers: Headers) => Result.Result<{
    readonly catalogKey?: CatalogId;
    readonly unitHash?: CatalogUnitHash;
}, Unauthorized>;
export declare const isEntityRef: (value: unknown) => value is EntityRef;
export declare const readJsonObject: (request: Request) => Effect.Effect<Record<string, unknown>, BadRequest>;
export declare const parseOneShotReadRequest: (request: Request<unknown, CfProperties<unknown>>, rest: string) => Effect.Effect<ParsedOneShotRead, BadRequest | Unauthorized, never>;
export declare const acquireCurrentDb: (env: RamoseEnv, request: Request, options?: {
    readonly bypassBasisCache?: boolean;
    readonly authoritativeBasisFence?: boolean;
}) => ((database: DatabaseId) => Effect.Effect<Db, RamoseError>);
export declare const provisionResolvedDatabase: (env: RamoseEnv, route: ResolvedDatabaseRoute, derivation: DatabaseRouteDerivation) => Effect.Effect<void, RamoseError>;
export declare const acquireWatchedDb: (env: RamoseEnv, currentBasis: () => Basis | undefined) => ((database: DatabaseId) => Effect.Effect<Db, RamoseError>);
export declare const queryMaxCells: (env: RamoseEnv) => number;
//# sourceMappingURL=authorized-read.d.ts.map