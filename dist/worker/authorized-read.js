import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { CatalogId, CatalogUnitHash, DatabaseId, MAX_COLLECTION_SIZE, MAX_STRING_LENGTH, } from "../internal/authorization/index.js";
import { parseJson } from "../internal/core/json.js";
import { dbFromBasis } from "../internal/replica/basis.js";
import { envInt } from "../internal/transactor/env.js";
import { DEFAULT_QUERY_MAX_CELLS } from "../internal/core/query/engine.js";
import { BadRequest, Unauthorized, fromThrown } from "./errors.js";
import { internalHeaders } from "../internal/transactor/index.js";
import { fetchBasis, invalidateBasis, segmentSource } from "./peer.js";
const deny = () => new Unauthorized({});
const CATALOG_HEADER = "x-ramose-catalog";
const UNIT_HASH_HEADER = "x-ramose-unit-hash";
const asRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
    ? Result.succeed(value)
    : Result.fail(new BadRequest({ message: "body must be a JSON object" }));
const decodeCatalogId = (value) => {
    const decoded = Schema.decodeUnknownResult(CatalogId)(value);
    return Result.isSuccess(decoded) && decoded.success.trim().length > 0
        ? Result.succeed(decoded.success)
        : Result.fail(deny());
};
const decodeUnitHash = (value) => {
    const decoded = Schema.decodeUnknownResult(CatalogUnitHash)(value);
    return Result.isSuccess(decoded) ? Result.succeed(decoded.success) : Result.fail(deny());
};
export const parseCatalogProof = (body, headers) => {
    const catalog = body?.catalog ?? headers.get(CATALOG_HEADER);
    const unitHash = body?.unitHash ?? headers.get(UNIT_HASH_HEADER);
    const catalogKey = decodeCatalogId(catalog);
    if (Result.isFailure(catalogKey))
        return Result.fail(catalogKey.failure);
    const hash = decodeUnitHash(unitHash);
    if (Result.isFailure(hash))
        return Result.fail(hash.failure);
    return Result.succeed({ catalogKey: catalogKey.success, unitHash: hash.success });
};
export const parseGraphPath = (body, search) => {
    const queryPath = search.getAll("at");
    const bodyPath = body?.at;
    if (bodyPath !== undefined && queryPath.length > 0) {
        return Result.fail(new BadRequest({
            message: "graph path must be supplied once",
        }));
    }
    const path = bodyPath === undefined ? queryPath : bodyPath;
    if (!Array.isArray(path) || path.length > MAX_COLLECTION_SIZE) {
        return Result.fail(new BadRequest({
            message: "at must be a bounded string array",
        }));
    }
    const segments = [];
    for (const segment of path) {
        if (typeof segment !== "string" || segment.length === 0 ||
            segment.length > MAX_STRING_LENGTH) {
            return Result.fail(new BadRequest({
                message: "at must contain bounded non-empty strings",
            }));
        }
        segments.push(segment);
    }
    return Result.succeed(Object.freeze(segments));
};
export const carriesCatalogProof = (body, headers) => (body !== undefined &&
    (Object.hasOwn(body, "catalog") || Object.hasOwn(body, "unitHash"))) ||
    headers.has(CATALOG_HEADER) || headers.has(UNIT_HASH_HEADER);
export const refuseCatalogProof = (body, headers) => carriesCatalogProof(body, headers)
    ? Result.fail(deny())
    : Result.succeed(undefined);
export const parseCatalogProofForPath = (path, body, headers) => {
    if (path.length === 0)
        return parseCatalogProof(body, headers);
    if (carriesCatalogProof(body, headers))
        return Result.fail(deny());
    return Result.succeed({});
};
const viewOf = (body, search) => {
    const asOfRaw = body?.asOf ?? search.get("asOf");
    const asOf = typeof asOfRaw === "number"
        ? asOfRaw
        : typeof asOfRaw === "string" && asOfRaw.length > 0
            ? Number(asOfRaw)
            : undefined;
    const historyRaw = body?.history ?? search.get("history");
    const history = historyRaw === true || historyRaw === "true" ? true : historyRaw === false || historyRaw === "false" ? false : undefined;
    return {
        ...(typeof asOf === "number" && Number.isFinite(asOf) ? { asOf } : {}),
        ...(history === undefined ? {} : { history }),
    };
};
export const isEntityRef = (value) => {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0)
        return true;
    if (typeof value === "string" && value.length > 0)
        return true;
    return (Array.isArray(value) &&
        value.length === 2 &&
        typeof value[0] === "string" &&
        value[0].length > 0);
};
const readFromBody = (rest, method, body) => {
    if ((rest === "/query" || rest === "/live") && method === "POST") {
        if (body?.query !== undefined && body.query !== null) {
            return Result.succeed({
                kind: "query",
                query: body.query,
                ...(Array.isArray(body.inputs) ? { inputs: body.inputs } : {}),
            });
        }
        const pullBody = body?.pull;
        if (pullBody !== null && typeof pullBody === "object" && !Array.isArray(pullBody)) {
            const pull = pullBody;
            if (!isEntityRef(pull.eid) || pull.pattern === undefined || pull.pattern === null) {
                return Result.fail(new BadRequest({ message: "pull needs eid and pattern" }));
            }
            return Result.succeed({
                kind: "pull",
                eid: pull.eid,
                pattern: pull.pattern,
            });
        }
        if (body?.entity !== undefined) {
            if (!isEntityRef(body.entity)) {
                return Result.fail(new BadRequest({ message: "entity must be an eid, ident, or lookup ref" }));
            }
            return Result.succeed({ kind: "entity", ref: body.entity });
        }
        if (Array.isArray(body?.lookup) && isEntityRef(body.lookup)) {
            const lookup = body.lookup;
            if (!Array.isArray(lookup) || lookup.length !== 2 || typeof lookup[0] !== "string") {
                return Result.fail(new BadRequest({ message: "lookup must be [attr, value]" }));
            }
            return Result.succeed({ kind: "lookup", ref: [lookup[0], lookup[1]] });
        }
        return Result.fail(new BadRequest({ message: "body must be { query, inputs? } | { pull } | { entity } | { lookup }" }));
    }
    if (rest === "/pull" && method === "POST") {
        if (body === undefined || !isEntityRef(body.eid) || body.pattern === undefined || body.pattern === null) {
            return Result.fail(new BadRequest({ message: "body must be { eid, pattern }" }));
        }
        return Result.succeed({
            kind: "pull",
            eid: body.eid,
            pattern: body.pattern,
        });
    }
    return Result.fail(deny());
};
const entityFromPath = (rest) => {
    const match = /^\/entity\/(\d+)$/.exec(rest);
    if (match === null)
        return Result.fail(deny());
    return Result.succeed({ kind: "entity", ref: Number(match[1]) });
};
export const readJsonObject = (request) => Effect.tryPromise({
    try: async () => {
        const text = await request.text();
        if (text.trim().length === 0) {
            throw new BadRequest({ message: "body must be a JSON object" });
        }
        return parseJson(text);
    },
    catch: (cause) => cause instanceof BadRequest ? cause : new BadRequest({ message: "body must be a JSON object" }),
}).pipe(Effect.flatMap((value) => Effect.fromResult(asRecord(value))));
export const parseOneShotReadRequest = Effect.fn("parseOneShotReadRequest")(function* (request, rest) {
    const url = new URL(request.url);
    const method = request.method;
    const body = method === "GET" ? undefined : yield* readJsonObject(request);
    const path = yield* Effect.fromResult(parseGraphPath(body, url.searchParams));
    const proof = yield* Effect.fromResult(parseCatalogProofForPath(path, body, request.headers));
    const read = method === "GET"
        ? yield* Effect.fromResult(entityFromPath(rest))
        : yield* Effect.fromResult(readFromBody(rest, method, body));
    return { read, view: viewOf(body, url.searchParams), path, ...proof };
});
export const acquireCurrentDb = (env, request, options = {}) => (database) => Effect.tryPromise({
    try: async () => {
        const basis = await fetchBasis(env, database, request, {
            bypassCache: options.bypassBasisCache === true,
            authoritativeFence: options.authoritativeBasisFence === true,
        });
        return dbFromBasis(segmentSource(env, database), basis);
    },
    catch: (cause) => fromThrown(cause),
});
export const provisionResolvedDatabase = (env, route, derivation) => Effect.tryPromise({
    try: async () => {
        const database = route.database;
        const stub = env.TRANSACTOR.get(env.TRANSACTOR.idFromName(database));
        const response = await stub.fetch(`https://transactor/provision-catalog?db=${encodeURIComponent(database)}`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                ...internalHeaders(env),
            },
            body: JSON.stringify({ derivation }),
        });
        if (!response.ok) {
            throw new Error(`dynamic database provisioning failed (${response.status})`);
        }
        invalidateBasis(database);
    },
    catch: (cause) => fromThrown(cause),
});
export const acquireWatchedDb = (env, currentBasis) => (database) => Effect.tryPromise({
    try: async () => {
        const basis = currentBasis();
        if (basis === undefined || basis.db !== database) {
            throw new Error("live basis unavailable");
        }
        return dbFromBasis(segmentSource(env, database), basis);
    },
    catch: (cause) => fromThrown(cause),
});
export const queryMaxCells = (env) => envInt(env.RAMOSE_QUERY_MAX_CELLS, DEFAULT_QUERY_MAX_CELLS);
//# sourceMappingURL=authorized-read.js.map