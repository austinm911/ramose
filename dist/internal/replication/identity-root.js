import { internalHeaders } from "../transactor/internal.js";
import { decodeServerIdentityRoot, sealingKeyOf, ServerIdentityUnavailable, } from "./server-identity.js";
export const SERVER_IDENTITY_ROOT_NAME = "ramose-server-identity-root-v1";
let cached;
export const serverIdentityRootId = (env) => env.REPLICA.idFromName(SERVER_IDENTITY_ROOT_NAME);
const load = async (env) => {
    let response;
    try {
        response = await env.REPLICA.get(serverIdentityRootId(env)).fetch("https://replica/server-identity", { method: "POST", headers: internalHeaders(env) });
    }
    catch (cause) {
        throw new ServerIdentityUnavailable({
            reason: "server identity root is unreachable",
            cause,
        });
    }
    if (!response.ok) {
        const failure = await response.text().catch(() => "");
        throw new ServerIdentityUnavailable({
            reason: `server identity root is unusable (${response.status}) ${failure}`.trim(),
        });
    }
    const body = (await response.json());
    const root = decodeServerIdentityRoot(body.root);
    if (root === undefined) {
        throw new ServerIdentityUnavailable({
            reason: "server identity root record is unreadable",
        });
    }
    return root;
};
export const serverIdentityRoot = (env) => {
    const existing = cached;
    if (existing !== undefined)
        return existing;
    const pending = load(env).catch((cause) => {
        if (cached === pending)
            cached = undefined;
        throw cause;
    });
    cached = pending;
    return pending;
};
export const serverSealingKey = async (env) => sealingKeyOf(await serverIdentityRoot(env));
export const clearServerIdentityRootCache = () => {
    cached = undefined;
};
//# sourceMappingURL=identity-root.js.map