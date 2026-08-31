import * as Effect from "effect/Effect";
import { canonicalizeJson } from "../authorization/canonical-json.js";
import { canonicalizeReadPolicy, GRAPH_READ_SEMANTICS_VERSION, hashReadCompatibility, } from "../authorization/read-compatibility.js";
import { base64Url } from "./server-identity.js";
const utf8 = new TextEncoder();
const keys = new Map();
const MAX_CACHED_KEYS = 4;
const keyFor = (sealing) => {
    let key = keys.get(sealing.material);
    if (key !== undefined)
        return key;
    if (keys.size >= MAX_CACHED_KEYS)
        keys.delete(keys.keys().next().value);
    key = crypto.subtle.importKey("raw", utf8.encode(sealing.material), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    keys.set(sealing.material, key);
    return key;
};
const canonical = (value) => canonicalizeJson(value);
export const opaqueHmac = async (sealing, domain, value) => {
    const key = await keyFor(sealing);
    const signature = await crypto.subtle.sign("HMAC", key, utf8.encode(`${domain}\0${canonical(value)}`));
    return base64Url(new Uint8Array(signature));
};
export const opaqueDigest = async (domain, bytes) => {
    const prefix = utf8.encode(`${domain}\0`);
    const material = new Uint8Array(prefix.byteLength + bytes.byteLength);
    material.set(prefix);
    material.set(bytes, prefix.byteLength);
    const digest = await crypto.subtle.digest("SHA-256", material);
    return base64Url(new Uint8Array(digest));
};
const callerMaterial = (caller) => ({
    claims: caller.claims,
    classes: [...caller.classes].sort(),
});
const graphLineage = async (sealing, path) => {
    if (path.dependencies.length === 0)
        return Object.freeze([]);
    const lineage = [];
    let parent = await opaqueHmac(sealing, "ramose:replication:graph-lineage-root:v1", path.rootDatabase);
    for (const dependency of path.dependencies) {
        const sealed = await opaqueHmac(sealing, "ramose:replication:graph-lineage:v1", {
            parent,
            parentDatabase: dependency.parentDatabase,
            entity: dependency.graphEntity,
        });
        lineage.push(sealed);
        parent = sealed;
    }
    return Object.freeze(lineage);
};
export const replicationReadRouteIdentities = async (routes) => Promise.all(routes.map(async (route) => ({
    database: route.database,
    readCompatibilityHash: await Effect.runPromise(hashReadCompatibility(route.deployed.unit.catalog)),
    readPolicy: canonicalizeReadPolicy(route.deployed.unit.policy),
})));
export const makeEntityIdScope = async (sealing, input) => {
    const [server, principal, database] = await Promise.all([
        opaqueHmac(sealing, "ramose:replication:server:v1", input.origin),
        opaqueHmac(sealing, "ramose:replication:principal:v1", callerMaterial(input.caller)),
        opaqueHmac(sealing, "ramose:replication:database:v1", input.database),
    ]);
    return Object.freeze({ server, principal, database });
};
export const entityIdScopeOf = (identity) => Object.freeze({
    server: identity.server,
    principal: identity.principal,
    database: identity.database,
});
export const makeReplicationIdentity = async (input) => {
    const target = input.path.routes[input.path.routes.length - 1];
    if (target === undefined)
        throw new Error("replication path has no target");
    const { server, principal, database } = await makeEntityIdScope(input.sealing, {
        origin: input.origin,
        caller: input.caller,
        database: target.database,
    });
    const catalog = await opaqueHmac(input.sealing, "ramose:replication:catalog:v1", target.catalogKey);
    const readCompatibilityHash = input.readRoutes[input.readRoutes.length - 1]
        ?.readCompatibilityHash;
    if (readCompatibilityHash === undefined)
        throw new Error("replication path has no read route");
    const readView = await opaqueHmac(input.sealing, "ramose:replication:read-view:v2", {
        graphReadSemantics: GRAPH_READ_SEMANTICS_VERSION,
        routes: input.readRoutes.map((route) => ({
            database: route.database,
            compatibility: route.readCompatibilityHash,
            policy: route.readPolicy,
        })),
        dependencies: input.path.dependencies.map((dependency) => ({
            parent: dependency.parentDatabase,
            entity: dependency.graphEntity,
        })),
    });
    const unsigned = {
        version: 1,
        server,
        principal,
        database,
        catalog,
        readView,
        readCompatibilityHash,
        graphLineage: await graphLineage(input.sealing, input.path),
    };
    const authenticator = await opaqueHmac(input.sealing, "ramose:replication:identity:v1", unsigned);
    return Object.freeze({ ...unsigned, authenticator });
};
export const makeEntityIdentity = (sealing, database, eid) => opaqueHmac(sealing, "ramose:replication:entity:v1", { database, eid });
export const makeRevision = (sealing, identity, stateDigest) => opaqueHmac(sealing, "ramose:replication:revision:v1", {
    binding: identity.authenticator,
    state: stateDigest,
});
export const makeSnapshotIdentity = (sealing, identity, revision) => opaqueHmac(sealing, "ramose:replication:snapshot:v1", {
    binding: identity.authenticator,
    revision,
});
//# sourceMappingURL=identity.js.map