import { env } from "cloudflare:workers";
import { createTransactorDO as createInternalTransactorDO, TransactorDO as InternalTransactorDO, } from "../internal/transactor/transactor-do.js";
import { QueryReplicaDO as InternalQueryReplicaDO } from "../internal/replica/index.js";
import { runFetch } from "./handle.js";
import { deployedDatabaseCatalogBindings, deployedOperationCatalogs, deployOperationCatalogsForVersion, } from "./operation-catalogs.js";
/** Cloudflare class exports with the internal binding shape erased. */
export const TransactorDO = InternalTransactorDO;
export const QueryReplicaDO = InternalQueryReplicaDO;
/**
 * Assemble native catalogs against Cloudflare's immutable Worker version.
 * Requires the `CF_VERSION_METADATA` binding that `Ramose.Server` installs.
 */
export const deployOperationCatalogs = (input) => deployOperationCatalogsForVersion(input, env.CF_VERSION_METADATA);
/** Build the Transactor class from the same opaque registry as `createServer`. */
export const createTransactorDO = (operationCatalogs) => createInternalTransactorDO(deployedOperationCatalogs(operationCatalogs), deployedDatabaseCatalogBindings(operationCatalogs));
export { OperationCatalogDeploymentError, } from "./operation-catalogs.js";
/** Build a peer Worker. One-shot reads consume the filtered request `Db`. */
export const createServer = (options = {}) => ({
    async fetch(request, env, _ctx) {
        return runFetch(request, env, options);
    },
});
export default createServer();
//# sourceMappingURL=index.js.map