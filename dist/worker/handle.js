import { isDatabaseName } from "../db/DatabaseName.js";
import { callerFromVerified, DatabaseId, executeAuthorizedGraphPathLive, executeAuthorizedGraphPathTarget, executeAuthorizedRead, graphPathLeaseIdentity, hashReadCompatibility, OneShotReadError, runOneShotRead, } from "../internal/authorization/index.js";
import { Histogram, RateMeter, componentLogger, setTelemetryLevel, toJson, } from "../internal/core/index.js";
import { MAX_REPLICATION_REQUEST_BYTES, ReplicationProtocolError, decodeActivationRequest, } from "../internal/replication/index.js";
import { isInternal } from "../internal/transactor/index.js";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { authenticateRequest } from "./admit.js";
import { acquireCurrentDb, acquireWatchedDb, parseOneShotReadRequest, provisionResolvedDatabase, queryMaxCells, } from "./authorized-read.js";
import { authorizedLiveResponse, liveResponseFromStream, } from "./authorized-live.js";
import { authorizedReplicationResponse, incompatibleReplicationResponse, updateRequiredReplicationResponse, } from "./authorized-replication.js";
import { Analytics, bindingOf, fromBinding, httpPoint, routeOf, } from "./analytics.js";
import { BadRequest, NotFound, OperationRejected, Unauthorized, fromThrown, isRamoseError, toHttp, } from "./errors.js";
import { JwtVerifier, fromEnv } from "./jwt.js";
import { mcpResponse } from "./mcp.js";
import { watchBasisChanges } from "./peer.js";
import { invokeAuthoritativeOperation, parseOperationRequest, publicOperationResult, } from "./authorized-operation.js";
import { deployedCatalogProof, deployedDatabaseCatalogBindings, deployedOperationCatalogs, } from "./operation-catalogs.js";
import { PUBLIC_HEALTH, publicCorsHeaders, publicErrorBody, publicResponseHeaders, } from "./public-observation.js";
const plog = componentLogger("peer");
const peerMetrics = {
    queries: new RateMeter(10_000),
    transacts: new RateMeter(10_000),
    queryMs: new Histogram(),
    transactMs: new Histogram(),
    budgetAborts: 0,
    errors: 0,
    aeWrites: 0,
};
let levelApplied = false;
const json = (body, status = 200, request, env, extra = {}) => new Response(JSON.stringify(toJson(body)), {
    status,
    headers: {
        "content-type": "application/json",
        ...publicResponseHeaders(extra),
        ...publicCorsHeaders(request, env),
    },
});
const DEPLOYMENT_HEADER = "x-ramose-deployment";
const deploymentVersion = (env) => {
    const id = env.CF_VERSION_METADATA?.id;
    return typeof id === "string" && id.length > 0 ? id : undefined;
};
export const respond = (err, request, env) => {
    const h = toHttp(err);
    return json(publicErrorBody(h.body), h.status, request, env, h.headers);
};
const recover = (info, t0, request, env) => ({
    NotFound: (e) => Effect.sync(() => respond(e, request, env)),
    BadRequest: (e) => Effect.sync(() => respond(e, request, env)),
    Unauthorized: (e) => Effect.sync(() => respond(e, request, env)),
    UpstreamError: (e) => Effect.sync(() => respond(e, request, env)),
    QueryBudgetExceeded: (e) => Effect.sync(() => {
        peerMetrics.budgetAborts++;
        plog.warn("query.budget-exceeded", {
            db: info.db,
            clause: e.clause,
            cells: e.cells,
            limit: e.limit,
            spentBy: e.spentBy ?? "caller",
            ms: Date.now() - t0,
        });
        return respond(e, request, env);
    }),
    Internal: (e) => Effect.sync(() => {
        peerMetrics.errors++;
        plog.error("request.error", {
            db: info.db,
            path: info.path,
            error: e.message,
        });
        return respond(e, request, env);
    }),
    OperationRejected: (e) => Effect.sync(() => respond(e, request, env)),
});
const recordHttp = (request, info, status, ms) => Effect.gen(function* () {
    const ae = yield* Analytics;
    if (!ae.bound)
        return;
    const colo = request.cf?.colo;
    yield* ae.writeDataPoint(httpPoint({
        db: info.db,
        ...(colo !== undefined ? { colo } : {}),
        route: info.route,
        status,
        ms,
    }));
    peerMetrics.aeWrites++;
}).pipe(Effect.ignoreCause);
const decodeDatabaseName = (encoded) => Result.try({
    try: () => decodeURIComponent(encoded),
    catch: () => new BadRequest({ message: "invalid database name" }),
});
const readReplicationActivation = async (request) => {
    const declared = request.headers.get("content-length");
    if (declared !== null &&
        (!/^\d+$/.test(declared) || Number(declared) > MAX_REPLICATION_REQUEST_BYTES)) {
        throw new ReplicationProtocolError({ reason: "oversized" });
    }
    if (request.body === null)
        return "";
    const reader = request.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    let text = "";
    try {
        for (;;) {
            const next = await reader.read();
            if (next.done)
                break;
            bytes += next.value.byteLength;
            if (bytes > MAX_REPLICATION_REQUEST_BYTES) {
                throw new ReplicationProtocolError({ reason: "oversized" });
            }
            text += decoder.decode(next.value, { stream: true });
        }
        text += decoder.decode();
        return text;
    }
    finally {
        reader.releaseLock();
    }
};
export const handle = (request, env, t0, info, peer, boundaries) => Effect.gen(function* () {
    if (!levelApplied) {
        levelApplied = true;
        const lvl = env.RAMOSE_LOG_LEVEL;
        if (lvl === "debug" ||
            lvl === "info" ||
            lvl === "warn" ||
            lvl === "error") {
            setTelemetryLevel(lvl);
        }
    }
    const url = new URL(request.url);
    const cors = publicCorsHeaders(request, env);
    info.path = url.pathname;
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
        return yield* new NotFound({});
    }
    if (url.pathname === "/health") {
        info.route = "health";
        const version = deploymentVersion(env);
        return new Response(JSON.stringify(PUBLIC_HEALTH), {
            status: 200,
            headers: {
                "content-type": "application/json",
                ...cors,
                "cache-control": "no-store",
                ...(version === undefined || !isInternal(env, request)
                    ? {}
                    : { [DEPLOYMENT_HEADER]: version }),
            },
        });
    }
    const match = /^\/db\/([^/]+)(\/.*)?$/.exec(url.pathname);
    if (match === null)
        return yield* new NotFound({});
    const rest = match[2] ?? "/";
    info.path = rest;
    info.route = routeOf(rest, request.method);
    const verified = yield* authenticateRequest(request);
    const db = yield* Effect.fromResult(decodeDatabaseName(match[1]));
    info.db = db;
    if (!isDatabaseName(db)) {
        return yield* new BadRequest({ message: "invalid database name" });
    }
    const deployedOperations = peer.operationCatalogs === undefined
        ? undefined
        : deployedOperationCatalogs(peer.operationCatalogs);
    const databaseBindings = peer.operationCatalogs === undefined
        ? undefined
        : deployedDatabaseCatalogBindings(peer.operationCatalogs);
    const catalogs = deployedOperations?.catalogs;
    if (rest === "/replicate" && request.method === "POST") {
        if (databaseBindings === undefined) {
            return yield* new Unauthorized({ status: 403 });
        }
        const activationText = yield* Effect.tryPromise({
            try: () => readReplicationActivation(request),
            catch: () => new BadRequest({ message: "invalid replication activation" }),
        });
        const decoded = decodeActivationRequest(activationText);
        if (Result.isFailure(decoded)) {
            if (decoded.failure.reason === "incompatible-version") {
                return incompatibleReplicationResponse(cors);
            }
            return yield* new BadRequest({ message: "invalid replication activation" });
        }
        const root = yield* Effect.fromResult(databaseBindings.root(DatabaseId.make(db))).pipe(Effect.mapError(() => new Unauthorized({ status: 403 })));
        const caller = callerFromVerified(verified);
        const initialTarget = yield* executeAuthorizedGraphPathTarget({
            authenticate: Effect.succeed(caller),
            bindings: databaseBindings,
            root,
            path: decoded.success.graphPath,
            currentDb: acquireCurrentDb(env, request, {
                bypassBasisCache: true,
                authoritativeBasisFence: true,
            }),
            provision: (route, derivation) => provisionResolvedDatabase(env, route, derivation),
        }, (authorized) => Effect.succeed(authorized)).pipe(Effect.mapError((cause) => isRamoseError(cause) ? cause : fromThrown(cause, {
            stacks: env.RAMOSE_STAGE !== "prod",
        })));
        const targetCompatibility = yield* hashReadCompatibility(initialTarget.route.deployed.unit.catalog).pipe(Effect.mapError((cause) => fromThrown(cause, {
            stacks: env.RAMOSE_STAGE !== "prod",
        })));
        if (decoded.success.readCompatibilityHash !== targetCompatibility) {
            return updateRequiredReplicationResponse(cors);
        }
        return yield* authorizedReplicationResponse({
            activation: decoded.success,
            env,
            request,
            bindings: databaseBindings,
            root,
            initialCaller: caller,
            initialTarget,
            headers: cors,
            ...(boundaries === undefined ? {} : { boundaries }),
        }).pipe(Effect.mapError((cause) => fromThrown(cause, {
            stacks: env.RAMOSE_STAGE !== "prod",
        })));
    }
    if (rest === "/mcp" && request.method === "POST") {
        if (databaseBindings === undefined) {
            return yield* new Unauthorized({ status: 403 });
        }
        const root = yield* Effect.fromResult(databaseBindings.root(DatabaseId.make(db))).pipe(Effect.mapError(() => new Unauthorized({ status: 403 })));
        return yield* mcpResponse({
            env,
            request,
            bindings: databaseBindings,
            root,
            caller: callerFromVerified(verified),
            headers: cors,
            ...(boundaries === undefined ? {} : { boundaries }),
        });
    }
    if (rest === "/op" && request.method === "POST") {
        if (peer.operationCatalogs === undefined) {
            return yield* new Unauthorized({ status: 403 });
        }
        const parsed = yield* parseOperationRequest(request);
        const caller = callerFromVerified(verified);
        const invoke = (database, catalogKey, unitHash, routeDerivation) => Effect.tryPromise({
            try: () => invokeAuthoritativeOperation(env, database, new URL(request.url).origin, {
                catalogKey,
                unitHash,
                owner: parsed.owner,
                localName: parsed.localName,
                invocationId: parsed.invocationId,
                ...(parsed.operationVersion === undefined
                    ? {}
                    : { operationVersion: parsed.operationVersion }),
                ...(parsed.target === undefined ? {} : { target: parsed.target }),
                ...(parsed.sealedTarget === undefined
                    ? {}
                    : { sealedTarget: parsed.sealedTarget }),
                ...(parsed.allocations === undefined
                    ? {}
                    : { allocations: parsed.allocations }),
                input: parsed.input,
            }, caller, routeDerivation),
            catch: (cause) => isRamoseError(cause) ? cause : fromThrown(cause, {
                stacks: env.RAMOSE_STAGE !== "prod",
            }),
        });
        const rootProof = deployedCatalogProof(peer.operationCatalogs, db);
        const ack = parsed.path.length === 0
            ? rootProof === undefined
                ? yield* new Unauthorized({ status: 403 })
                : yield* Effect.gen(function* () {
                    if (databaseBindings !== undefined) {
                        const root = yield* Effect.fromResult(databaseBindings.root(DatabaseId.make(db))).pipe(Effect.mapError(() => new Unauthorized({ status: 403 })));
                        yield* provisionResolvedDatabase(env, root, {
                            rootDatabase: root.database,
                            graphs: [],
                        });
                    }
                    return yield* invoke(db, rootProof.catalogKey, rootProof.unitHash);
                })
            : databaseBindings === undefined
                ? yield* new Unauthorized({ status: 403 })
                : yield* Effect.gen(function* () {
                    const root = yield* Effect.fromResult(databaseBindings.root(DatabaseId.make(db))).pipe(Effect.mapError(() => new Unauthorized({ status: 403 })));
                    const currentDb = acquireCurrentDb(env, request, {
                        bypassBasisCache: true,
                        authoritativeBasisFence: true,
                    });
                    const target = yield* executeAuthorizedGraphPathTarget({
                        authenticate: Effect.succeed(caller),
                        bindings: databaseBindings,
                        root,
                        path: parsed.path,
                        currentDb,
                        provision: (route, derivation) => provisionResolvedDatabase(env, route, derivation),
                    }, (authorized) => Effect.succeed(authorized));
                    return yield* invoke(target.route.database, target.route.deployed.catalogKey, target.route.deployed.unitHash, target.derivation);
                });
        yield* Effect.tryPromise({
            try: () => boundaries?.checkpoint("operation.response") ?? Promise.resolve(),
            catch: (cause) => isRamoseError(cause) ? cause : fromThrown(cause, {
                stacks: env.RAMOSE_STAGE !== "prod",
            }),
        });
        if (!Number.isSafeInteger(caller.exp) || caller.exp * 1_000 <= Date.now()) {
            return yield* new Unauthorized({ status: 403 });
        }
        const projected = publicOperationResult(ack);
        return new Response(JSON.stringify(projected.status === 200
            ? projected.body
            : publicErrorBody(projected.body)), {
            status: projected.status,
            headers: { "content-type": "application/json", ...cors },
        });
    }
    if (catalogs === undefined)
        return yield* new Unauthorized({});
    if (!((rest === "/query" || rest === "/pull" || rest === "/live") && request.method === "POST") &&
        !(/^\/entity\/\d+$/.test(rest) && request.method === "GET")) {
        return yield* new Unauthorized({});
    }
    const parsed = yield* parseOneShotReadRequest(request, rest);
    const stacks = env.RAMOSE_STAGE !== "prod";
    const mapReadError = (error) => {
        if (error instanceof Unauthorized)
            return error;
        if (isRamoseError(error))
            return error;
        if (error instanceof OneShotReadError)
            return fromThrown(error.cause, { stacks });
        return fromThrown(error, { stacks });
    };
    if (parsed.path.length > 0) {
        if (databaseBindings === undefined) {
            return yield* new Unauthorized({ status: 403 });
        }
        const root = yield* Effect.fromResult(databaseBindings.root(DatabaseId.make(db))).pipe(Effect.mapError(() => new Unauthorized({ status: 403 })));
        const pathInput = {
            authenticate: Effect.succeed(callerFromVerified(verified)),
            bindings: databaseBindings,
            root,
            path: parsed.path,
            currentDb: acquireCurrentDb(env, request, {
                bypassBasisCache: true,
                authoritativeBasisFence: true,
            }),
            provision: (route, derivation) => provisionResolvedDatabase(env, route, derivation),
            view: parsed.view,
        };
        const readTarget = (target) => Effect.tryPromise({
            try: () => runOneShotRead(target.context.filteredDb, parsed.read, {
                maxCells: queryMaxCells(env),
            }),
            catch: (cause) => new OneShotReadError({ cause }),
        });
        if (rest === "/live") {
            const target = yield* executeAuthorizedGraphPathTarget(pathInput, (authorized) => readTarget(authorized).pipe(Effect.as(authorized))).pipe(Effect.mapError(mapReadError));
            const liveWatch = watchBasisChanges(env, target.route.database, request);
            const stream = executeAuthorizedGraphPathLive({
                ...pathInput,
                authenticate: authenticateRequest(request).pipe(Effect.map(callerFromVerified)),
                currentDb: acquireCurrentDb(env, request, {
                    bypassBasisCache: true,
                    authoritativeBasisFence: true,
                }),
                provision: () => Effect.void,
                basisChanges: liveWatch.changes,
                expectedLeaseIdentity: graphPathLeaseIdentity(target, parsed.path),
                ...(boundaries === undefined ? {} : { boundaries }),
            }, parsed.read, { maxCells: queryMaxCells(env) });
            return yield* liveResponseFromStream(stream, cors);
        }
        const result = yield* executeAuthorizedGraphPathTarget(pathInput, readTarget).pipe(Effect.mapError(mapReadError));
        return json({ result }, 200, request, env);
    }
    if (parsed.catalogKey === undefined || parsed.unitHash === undefined) {
        return yield* new Unauthorized({ status: 403 });
    }
    const liveWatch = rest === "/live" ? watchBasisChanges(env, db, request) : undefined;
    const admissionCurrentDb = acquireCurrentDb(env, request, {
        bypassBasisCache: rest === "/live",
        authoritativeBasisFence: rest === "/live",
    });
    const input = {
        authenticate: rest === "/live"
            ? authenticateRequest(request).pipe(Effect.map(callerFromVerified))
            : Effect.succeed(callerFromVerified(verified)),
        ...(liveWatch === undefined ? {} : {
            basisChanges: liveWatch.changes,
            admissionCurrentDb,
        }),
        catalogs,
        routeDatabase: DatabaseId.make(db),
        catalogKey: parsed.catalogKey,
        unitHash: parsed.unitHash,
        currentDb: liveWatch === undefined
            ? admissionCurrentDb
            : acquireWatchedDb(env, liveWatch.currentBasis),
        view: parsed.view,
    };
    if (rest === "/live") {
        return yield* authorizedLiveResponse(boundaries === undefined
            ? input
            : { ...input, boundaries }, parsed.read, { maxCells: queryMaxCells(env) }, cors).pipe(Effect.mapError(mapReadError));
    }
    const result = yield* executeAuthorizedRead(input, parsed.read, {
        maxCells: queryMaxCells(env),
    }).pipe(Effect.mapError(mapReadError));
    return json({ result }, 200, request, env);
});
export const runFetch = (request, env, peer, boundaries) => {
    const t0 = Date.now();
    const info = { db: "-", path: "-", route: "other" };
    const services = Context.make(Analytics, fromBinding(bindingOf(env))).pipe(Context.add(JwtVerifier, fromEnv(env)));
    return Effect.runPromise(handle(request, env, t0, info, peer, boundaries).pipe(Effect.catchTags(recover(info, t0, request, env)), Effect.tap((res) => recordHttp(request, info, res.status, Date.now() - t0)), Effect.provide(services)));
};
//# sourceMappingURL=handle.js.map