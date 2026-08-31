import { type DeployOperationCatalogsInput, type OperationCatalogs } from "./operation-catalogs.ts";
type WorkerDurableObjectClass = new (ctx: DurableObjectState, env: unknown) => DurableObject;
/** Cloudflare class exports with the internal binding shape erased. */
export declare const TransactorDO: WorkerDurableObjectClass;
export declare const QueryReplicaDO: WorkerDurableObjectClass;
/**
 * Assemble native catalogs against Cloudflare's immutable Worker version.
 * Requires the `CF_VERSION_METADATA` binding that `Ramose.Server` installs.
 */
export declare const deployOperationCatalogs: (input: DeployOperationCatalogsInput) => import("effect/Effect").Effect<OperationCatalogs, import("./operation-catalogs.ts").OperationCatalogDeploymentError, never>;
/** Build the Transactor class from the same opaque registry as `createServer`. */
export declare const createTransactorDO: (operationCatalogs: OperationCatalogs) => WorkerDurableObjectClass;
export { OperationCatalogDeploymentError, type DeployOperationCatalogsInput, type OperationCatalogDeployment, type OperationCatalogProof, type OperationCatalogs, } from "./operation-catalogs.ts";
/** Opaque runtime assembly accepted by the supported Worker entry. */
export interface ServerOptions {
    readonly operationCatalogs?: OperationCatalogs;
}
/** Build a peer Worker. One-shot reads consume the filtered request `Db`. */
export declare const createServer: (options?: ServerOptions) => {
    fetch(request: Request, env: unknown, _ctx?: ExecutionContext): Promise<Response>;
};
declare const _default: {
    fetch(request: Request, env: unknown, _ctx?: ExecutionContext): Promise<Response>;
};
export default _default;
//# sourceMappingURL=index.d.ts.map