import { handleIsolateTestAdmin, resetTestHooks, testHooksEnabled, testRuntimeBoundaries, } from "../internal/test-hooks.js";
import { createTestingQueryReplicaDO, } from "../internal/replica/replica-do-testing.js";
import { createTestingTransactorDO, } from "../internal/transactor/transactor-do.js";
import { respond, runFetch, } from "./handle.js";
import { deployedDatabaseCatalogBindings, deployedOperationCatalogs, } from "./operation-catalogs.js";
import { asTestAdminError, handleTestAdmin } from "./test-admin.js";
const TEST_CAPABILITY_HEADER = "x-ramose-test-capability";
const TEST_CAPABILITY_QUERY = "__ramose_test_capability";
const same = (left, right) => {
    if (left.length !== right.length)
        return false;
    let difference = 0;
    for (let index = 0; index < left.length; index++) {
        difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return difference === 0;
};
const configured = (env) => {
    const capability = env.RAMOSE_TEST_CAPABILITY;
    return typeof capability === "string" && capability.length >= 32
        ? capability
        : undefined;
};
const serverEnabled = (request, env) => {
    const capability = configured(env);
    if (!testHooksEnabled(env) || capability === undefined)
        return false;
    const supplied = request.headers.get(TEST_CAPABILITY_HEADER) ??
        new URL(request.url).searchParams.get(TEST_CAPABILITY_QUERY) ?? "";
    return same(supplied, capability);
};
const durableObjectEnabled = (env) => testHooksEnabled(env) && configured(env) !== undefined;
const durableObjectTesting = Object.freeze({
    boundaries: testRuntimeBoundaries,
    enabled: durableObjectEnabled,
    reset: resetTestHooks,
    handleAdmin: handleIsolateTestAdmin,
});
export const createServer = (options = {}) => ({
    async fetch(request, env, _ctx) {
        const runtimeEnv = env;
        const enabled = serverEnabled(request, runtimeEnv);
        if (new URL(request.url).pathname.startsWith("/__test__/") &&
            enabled) {
            try {
                const proofMatch = /^\/__test__\/db\/([^/]+)\/catalog-proof$/.exec(new URL(request.url).pathname);
                if (proofMatch !== null && request.method === "GET") {
                    const proof = options.operationCatalogs?.proof(decodeURIComponent(proofMatch[1]));
                    return proof === undefined
                        ? new Response(JSON.stringify({ error: "not found" }), {
                            status: 404,
                            headers: { "content-type": "application/json" },
                        })
                        : new Response(JSON.stringify(proof), {
                            headers: { "content-type": "application/json" },
                        });
                }
                return await handleTestAdmin(request, runtimeEnv, new URL(request.url));
            }
            catch (cause) {
                return respond(asTestAdminError(cause), request, runtimeEnv);
            }
        }
        return runFetch(request, runtimeEnv, options, testRuntimeBoundaries);
    },
});
export const createTransactorDO = (operationCatalogs) => createTestingTransactorDO(durableObjectTesting, deployedOperationCatalogs(operationCatalogs), deployedDatabaseCatalogBindings(operationCatalogs));
export const TransactorDO = createTestingTransactorDO(durableObjectTesting);
export const QueryReplicaDO = createTestingQueryReplicaDO(durableObjectTesting);
export default createServer();
//# sourceMappingURL=testing.js.map