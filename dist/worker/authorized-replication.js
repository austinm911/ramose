import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { MAX_READ_LEASE_MS, constructAuthorizedResolvedRequestContext, executeAuthorizedGraphPathTarget, graphPathLeaseIdentity, sameGraphPathLeaseIdentity, } from "../internal/authorization/index.js";
import { chunkStillAuthorized, digestLogicalDb, diffLogicalDbs, encodeReplicationFrame, entryHandles, makeLogicalIdentityEncoder, entityIdScopeOf, makeReplicationIdentity, replicationReadRouteIdentities, makeRevision, makeSnapshotIdentity, replicationFrameFitsBound, sameReplicationIdentity, snapshotEntryChunks, REPLICATION_PROTOCOL_VERSION, sealingKeyOf, } from "../internal/replication/index.js";
import { callerFromVerified } from "../internal/authorization/request.js";
import { authenticateRequest } from "./admit.js";
import { serverIdentityRoot } from "./server-identity.js";
import { acquireCurrentDb } from "./authorized-read.js";
import { JwtVerifier } from "./jwt.js";
import { rememberReplicationRevision, resolveReplicationRevision, watchBasisChanges, } from "./peer.js";
const encoder = new TextEncoder();
const ABORTED = Symbol("ramose/replication/aborted");
const WATCH_FAILED = Symbol("ramose/replication/watch-failed");
const REPLICATION_CYCLE_INTERVAL_MS = MAX_READ_LEASE_MS;
class ReplicationRuntimeError extends Data.TaggedError("ReplicationRuntimeError") {
}
class ResumeBasisUnavailable extends Data.TaggedError("ResumeBasisUnavailable") {
}
const runtimeError = (reason, cause) => cause === undefined
    ? new ReplicationRuntimeError({ reason })
    : new ReplicationRuntimeError({ reason, cause });
const makeStreamAbortController = () => new AbortController();
const frame = (value) => value;
const abortable = async (promise, signal) => {
    signal.throwIfAborted();
    let onAbort;
    const interrupted = new Promise((_, reject) => {
        onAbort = () => reject(signal.reason ?? new Error("replication aborted"));
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted)
            onAbort();
    });
    try {
        return await Promise.race([promise, interrupted]);
    }
    finally {
        if (onAbort !== undefined)
            signal.removeEventListener("abort", onAbort);
    }
};
const atBoundary = async (boundaries, name, signal) => {
    signal.throwIfAborted();
    if (boundaries === undefined)
        return;
    try {
        await abortable(boundaries.checkpoint(name), signal);
    }
    catch (cause) {
        boundaries.checkpointCancel?.(name);
        throw cause;
    }
    signal.throwIfAborted();
};
const abortPromise = (signal) => signal.aborted
    ? Promise.resolve(ABORTED)
    : new Promise((resolve) => {
        signal.addEventListener("abort", () => resolve(ABORTED), { once: true });
    });
const scheduledCycle = (milliseconds) => {
    const controller = new AbortController();
    const promise = scheduler.wait(milliseconds, { signal: controller.signal })
        .then(() => "cycle")
        .catch((cause) => controller.signal.aborted
        ? new Promise(() => undefined)
        : Promise.reject(cause));
    return {
        promise,
        cancel: () => controller.abort(),
    };
};
const rawDatabase = (version) => version.target.route.database;
const leaseAlive = (version) => Date.now() < version.leaseExpiresAt;
const identityEncoder = (input, version) => makeLogicalIdentityEncoder(input.sealing, version.identity.authenticator, entityIdScopeOf(version.identity));
const currentState = async (input, version, logical, signal) => {
    const stateDigest = await digestLogicalDb(version.target.context.filteredDb, logical, signal);
    return Object.freeze({
        version,
        basisT: version.target.context.currentDb.basisT,
        revision: await makeRevision(input.sealing, version.identity, stateDigest),
    });
};
const remember = (input, state) => rememberReplicationRevision(input.env, rawDatabase(state.version), {
    revision: state.revision,
    binding: state.version.identity.authenticator,
    basisT: state.basisT,
    keyId: input.identityRoot.keyId,
});
const sameVersion = (expectedPath, expectedIdentity, version) => sameGraphPathLeaseIdentity(expectedPath, version.pathIdentity) &&
    sameReplicationIdentity(expectedIdentity, version.identity);
const snapshotFrames = async function* (input, authorize, expectedPath, expectedIdentity, signal) {
    for (;;) {
        let version = await authorize();
        if (!sameVersion(expectedPath, expectedIdentity, version)) {
            throw new Error("replication authorization partition changed");
        }
        const logical = identityEncoder(input, version);
        const candidate = await currentState(input, version, logical, signal);
        if (!leaseAlive(version))
            continue;
        const snapshot = await makeSnapshotIdentity(input.sealing, version.identity, candidate.revision);
        signal.throwIfAborted();
        yield frame({
            type: "SnapshotStart",
            protocol: REPLICATION_PROTOCOL_VERSION,
            identity: version.identity,
            snapshot,
            revision: candidate.revision,
        });
        let index = 0;
        let restart = false;
        let renewedSnapshot;
        const authorizeChunk = async (entries) => {
            for (;;) {
                if (!leaseAlive(version)) {
                    const renewed = await authorize();
                    if (!sameVersion(expectedPath, expectedIdentity, renewed)) {
                        throw new Error("replication authorization partition changed");
                    }
                    version = renewed;
                    renewedSnapshot = renewed.target.context.filteredDb;
                }
                if (renewedSnapshot !== undefined &&
                    !await chunkStillAuthorized(renewedSnapshot, entries, signal))
                    return false;
                if (leaseAlive(version)) {
                    signal.throwIfAborted();
                    return true;
                }
            }
        };
        for await (const entries of snapshotEntryChunks(version.target.context.filteredDb, logical, (entries, chunkIndex) => replicationFrameFitsBound({
            type: "SnapshotChunk",
            protocol: REPLICATION_PROTOCOL_VERSION,
            identity: expectedIdentity,
            snapshot,
            index: chunkIndex,
            datoms: entries.map((entry) => entry.datom),
            handles: entryHandles(entries),
        }), signal)) {
            if (!await authorizeChunk(entries)) {
                restart = true;
                break;
            }
            await atBoundary(input.boundaries, "replication.snapshot.chunk", signal);
            if (!await authorizeChunk(entries)) {
                restart = true;
                break;
            }
            signal.throwIfAborted();
            yield frame({
                type: "SnapshotChunk",
                protocol: REPLICATION_PROTOCOL_VERSION,
                identity: expectedIdentity,
                snapshot,
                index,
                datoms: entries.map((entry) => entry.datom),
                handles: entryHandles(entries),
            });
            index++;
        }
        if (restart)
            continue;
        const finalVersion = await authorize();
        if (!sameVersion(expectedPath, expectedIdentity, finalVersion)) {
            throw new Error("replication authorization partition changed");
        }
        const finalState = await currentState(input, finalVersion, logical, signal);
        if (!leaseAlive(finalVersion) || finalState.revision !== candidate.revision) {
            continue;
        }
        await remember(input, finalState);
        if (!leaseAlive(finalVersion))
            continue;
        await atBoundary(input.boundaries, "replication.snapshot.commit", signal);
        if (!leaseAlive(finalVersion))
            continue;
        signal.throwIfAborted();
        yield frame({
            type: "SnapshotCommit",
            protocol: REPLICATION_PROTOCOL_VERSION,
            identity: expectedIdentity,
            snapshot,
            revision: candidate.revision,
            chunks: index,
        });
        return finalState;
    }
};
const resetFrames = async function* (input, authorize, expectedPath, expectedIdentity, signal) {
    const version = await authorize();
    if (!sameVersion(expectedPath, expectedIdentity, version)) {
        throw new Error("replication authorization partition changed");
    }
    signal.throwIfAborted();
    yield frame({
        type: "Reset",
        protocol: REPLICATION_PROTOCOL_VERSION,
        identity: expectedIdentity,
    });
    return yield* snapshotFrames(input, authorize, expectedPath, expectedIdentity, signal);
};
const advanceFrames = async function* (input, authorize, authorizeAt, expectedPath, expectedIdentity, previous, signal, options = {}) {
    let firstVersion = options.initialVersion;
    for (;;) {
        const version = firstVersion ?? await authorize();
        firstVersion = undefined;
        if (!sameVersion(expectedPath, expectedIdentity, version)) {
            throw new Error("replication authorization partition changed");
        }
        if (previous.basisT > version.target.context.currentDb.basisT) {
            return yield* resetFrames(input, authorize, expectedPath, expectedIdentity, signal);
        }
        const logical = identityEncoder(input, version);
        const reconstruct = async (work) => {
            try {
                return await work();
            }
            catch (cause) {
                signal.throwIfAborted();
                throw new ResumeBasisUnavailable({ cause });
            }
        };
        let before;
        try {
            before = await reconstruct(async () => {
                await atBoundary(input.boundaries, "replication.resume.reconstruct", signal);
                return authorizeAt(version, previous.basisT);
            });
        }
        catch (cause) {
            if (!(cause instanceof ResumeBasisUnavailable))
                throw cause;
            return yield* resetFrames(input, authorize, expectedPath, expectedIdentity, signal);
        }
        let delta;
        try {
            delta = await reconstruct(() => diffLogicalDbs(before, version.target.context.filteredDb, logical, signal));
        }
        catch (cause) {
            if (!(cause instanceof ResumeBasisUnavailable))
                throw cause;
            return yield* resetFrames(input, authorize, expectedPath, expectedIdentity, signal);
        }
        const beforeRevision = await makeRevision(input.sealing, expectedIdentity, delta.previousStateDigest);
        if (beforeRevision !== previous.revision) {
            return yield* resetFrames(input, authorize, expectedPath, expectedIdentity, signal);
        }
        const revision = await makeRevision(input.sealing, expectedIdentity, delta.stateDigest);
        if (delta.overflow) {
            return yield* resetFrames(input, authorize, expectedPath, expectedIdentity, signal);
        }
        const finalVersion = await authorize();
        if (!sameVersion(expectedPath, expectedIdentity, finalVersion)) {
            throw new Error("replication authorization partition changed");
        }
        const finalBasisT = finalVersion.target.context.currentDb.basisT;
        if (!leaseAlive(finalVersion) ||
            finalBasisT !== version.target.context.currentDb.basisT)
            continue;
        const finalState = Object.freeze({
            version: finalVersion,
            basisT: finalBasisT,
            revision,
        });
        await remember(input, finalState);
        if (revision === previous.revision) {
            await atBoundary(input.boundaries, options.acknowledgeUnchanged
                ? "replication.resume.ready"
                : "replication.silent", signal);
            if (options.acknowledgeUnchanged) {
                const readyVersion = await authorize();
                if (!sameVersion(expectedPath, expectedIdentity, readyVersion)) {
                    throw new Error("replication authorization partition changed");
                }
                if (!leaseAlive(readyVersion) ||
                    readyVersion.target.context.currentDb.basisT !== finalBasisT)
                    continue;
                const readyState = Object.freeze({
                    version: readyVersion,
                    basisT: finalBasisT,
                    revision,
                });
                signal.throwIfAborted();
                yield frame({
                    type: "ResumeReady",
                    protocol: REPLICATION_PROTOCOL_VERSION,
                    identity: expectedIdentity,
                    revision,
                });
                return readyState;
            }
            if (!leaseAlive(finalVersion))
                continue;
            signal.throwIfAborted();
            return finalState;
        }
        await atBoundary(input.boundaries, "replication.change", signal);
        if (!leaseAlive(finalVersion))
            continue;
        signal.throwIfAborted();
        yield frame({
            type: "Change",
            protocol: REPLICATION_PROTOCOL_VERSION,
            identity: expectedIdentity,
            from: previous.revision,
            revision,
            datoms: delta.datoms,
            handles: delta.handles,
        });
        return finalState;
    }
};
const replicationFrames = async function* (input, initialIdentity, context, signal) {
    const expectedPath = graphPathLeaseIdentity(input.initialTarget, input.activation.graphPath);
    let effectiveSignal = signal;
    const run = (effect) => Effect.runPromise(effect.pipe(Effect.provide(context)), {
        signal: effectiveSignal,
    });
    const origin = new URL(input.request.url).origin;
    const authorize = async () => {
        effectiveSignal.throwIfAborted();
        const version = await run(Effect.gen(function* () {
            const verified = yield* authenticateRequest(input.request);
            const caller = callerFromVerified(verified);
            const leaseStartedAt = Date.now();
            const leaseExpiresAt = Math.min(caller.exp * 1_000, leaseStartedAt + MAX_READ_LEASE_MS);
            const target = yield* executeAuthorizedGraphPathTarget({
                authenticate: Effect.succeed(caller),
                bindings: input.bindings,
                root: input.root,
                path: input.activation.graphPath,
                currentDb: acquireCurrentDb(input.env, input.request, {
                    bypassBasisCache: true,
                    authoritativeBasisFence: true,
                }),
                provision: () => Effect.void,
            }, (authorized) => Effect.succeed(authorized));
            const pathIdentity = graphPathLeaseIdentity(target, input.activation.graphPath);
            const identity = yield* Effect.tryPromise({
                try: async () => makeReplicationIdentity({
                    sealing: input.sealing,
                    origin,
                    caller,
                    path: pathIdentity,
                    readRoutes: await replicationReadRouteIdentities(target.routes),
                }),
                catch: (cause) => runtimeError("replication identity derivation failed", cause),
            });
            if (Date.now() >= leaseExpiresAt) {
                return yield* runtimeError("replication authorization lease exhausted");
            }
            return Object.freeze({
                caller,
                target,
                pathIdentity,
                identity,
                leaseExpiresAt,
            });
        }));
        effectiveSignal.throwIfAborted();
        return version;
    };
    const authorizeAt = (version, basisT) => {
        effectiveSignal.throwIfAborted();
        return run(constructAuthorizedResolvedRequestContext({
            authenticate: Effect.succeed(version.caller),
            bindings: input.bindings,
            route: version.target.route,
            currentDb: () => Effect.succeed(version.target.context.currentDb.asOf(basisT)),
        }, version.caller).pipe(Effect.map((authorized) => authorized.filteredDb)))
            .then((db) => {
            effectiveSignal.throwIfAborted();
            return db;
        });
    };
    const watch = watchBasisChanges(input.env, input.initialTarget.route.database, input.request);
    const effectiveController = new AbortController();
    const cancelEffective = () => effectiveController.abort(signal.reason);
    if (signal.aborted)
        cancelEffective();
    else
        signal.addEventListener("abort", cancelEffective, { once: true });
    effectiveSignal = effectiveController.signal;
    const watchFailed = watch.failed.then(() => {
        input.boundaries?.checkpointReached?.("replication.watch.failed");
        effectiveController.abort(new Error("replication basis watch closed"));
        return WATCH_FAILED;
    });
    const events = Stream.toAsyncIterable(watch.changes)[Symbol.asyncIterator]();
    const aborted = abortPromise(signal);
    try {
        const ready = await Promise.race([events.next(), aborted, watchFailed]);
        if (ready === ABORTED)
            return;
        if (ready === WATCH_FAILED) {
            throw new Error("replication basis watch closed");
        }
        if (ready.done || (ready.value !== "ready" && ready.value !== "change")) {
            throw new Error("replication basis watch did not become ready");
        }
        const opening = await authorize();
        if (!sameVersion(expectedPath, initialIdentity, opening)) {
            throw new Error("replication authorization partition changed");
        }
        let committed;
        const resume = input.activation.resumeRevision;
        if (resume === undefined) {
            committed = yield* snapshotFrames(input, authorize, expectedPath, initialIdentity, effectiveSignal);
        }
        else {
            let basisT;
            try {
                basisT = await abortable(resolveReplicationRevision(input.env, input.initialTarget.route.database, resume, initialIdentity.authenticator, input.identityRoot.keyId), effectiveSignal);
            }
            catch {
                effectiveSignal.throwIfAborted();
                basisT = undefined;
            }
            if (basisT === undefined) {
                committed = yield* resetFrames(input, authorize, expectedPath, initialIdentity, effectiveSignal);
            }
            else {
                committed = yield* advanceFrames(input, authorize, authorizeAt, expectedPath, initialIdentity, { basisT, revision: resume }, effectiveSignal, { acknowledgeUnchanged: true });
            }
        }
        effectiveSignal.throwIfAborted();
        let nextCycleAt = committed.version.leaseExpiresAt;
        let cycle = scheduledCycle(Math.max(0, nextCycleAt - Date.now()));
        try {
            while (!signal.aborted) {
                effectiveSignal.throwIfAborted();
                let next;
                if (Date.now() >= nextCycleAt)
                    next = "cycle";
                else
                    next = await Promise.race([cycle.promise, watchFailed, aborted]);
                if (next === ABORTED)
                    return;
                effectiveSignal.throwIfAborted();
                if (next === WATCH_FAILED) {
                    throw new Error("replication basis watch closed");
                }
                cycle.cancel();
                do
                    nextCycleAt += REPLICATION_CYCLE_INTERVAL_MS;
                while (nextCycleAt <= Date.now());
                await atBoundary(input.boundaries, "replication.cycle", effectiveSignal);
                const renewed = await authorize();
                if (!sameVersion(expectedPath, initialIdentity, renewed)) {
                    throw new Error("replication authorization partition changed");
                }
                if (renewed.target.context.currentDb.basisT === committed.basisT) {
                    committed = Object.freeze({ ...committed, version: renewed });
                    await atBoundary(input.boundaries, "replication.silent", effectiveSignal);
                }
                else {
                    committed = yield* advanceFrames(input, authorize, authorizeAt, expectedPath, initialIdentity, { basisT: committed.basisT, revision: committed.revision }, effectiveSignal, { initialVersion: renewed });
                }
                while (nextCycleAt <= Date.now()) {
                    nextCycleAt += REPLICATION_CYCLE_INTERVAL_MS;
                }
                nextCycleAt = Math.min(nextCycleAt, committed.version.leaseExpiresAt);
                cycle = scheduledCycle(Math.max(0, nextCycleAt - Date.now()));
            }
        }
        finally {
            cycle.cancel();
        }
    }
    finally {
        signal.removeEventListener("abort", cancelEffective);
        await events.return?.();
    }
};
const readableFrames = (frames, controller, requestSignal) => {
    const onAbort = () => {
        controller.abort();
        void frames.return?.().catch(() => undefined);
    };
    if (requestSignal.aborted)
        onAbort();
    else
        requestSignal.addEventListener("abort", onAbort, { once: true });
    const close = () => requestSignal.removeEventListener("abort", onAbort);
    return new ReadableStream({
        async pull(stream) {
            try {
                const next = await frames.next();
                if (next.done) {
                    close();
                    stream.close();
                    return;
                }
                stream.enqueue(encoder.encode(`${encodeReplicationFrame(next.value)}\n`));
            }
            catch {
                close();
                stream.close();
            }
        },
        async cancel() {
            controller.abort();
            close();
            await frames.return?.();
        },
    }, { highWaterMark: 0 });
};
export const authorizedReplicationResponse = (input) => Effect.gen(function* () {
    if (typeof input.env.RAMOSE_INTERNAL_SECRET !== "string" ||
        input.env.RAMOSE_INTERNAL_SECRET.length < 32) {
        return yield* new ReplicationRuntimeError({
            reason: "replication identity bindings unavailable",
        });
    }
    const initialPath = graphPathLeaseIdentity(input.initialTarget, input.activation.graphPath);
    const identityRoot = yield* Effect.tryPromise({
        try: () => serverIdentityRoot(input.env),
        catch: (cause) => runtimeError("server identity root unavailable", cause),
    });
    const run = {
        ...input,
        identityRoot,
        sealing: sealingKeyOf(identityRoot),
    };
    const initialIdentity = yield* Effect.tryPromise({
        try: async () => makeReplicationIdentity({
            sealing: run.sealing,
            origin: new URL(input.request.url).origin,
            caller: input.initialCaller,
            path: initialPath,
            readRoutes: await replicationReadRouteIdentities(input.initialTarget.routes),
        }),
        catch: (cause) => runtimeError("replication identity derivation failed", cause),
    });
    const context = yield* Effect.context();
    const controller = makeStreamAbortController();
    const guarded = async function* () {
        try {
            yield* replicationFrames(run, initialIdentity, context, controller.signal);
        }
        catch {
            if (!controller.signal.aborted) {
                yield frame({
                    type: "TerminalError",
                    protocol: REPLICATION_PROTOCOL_VERSION,
                    code: "closed",
                    identity: initialIdentity,
                });
            }
        }
    };
    return new Response(readableFrames(guarded(), controller, input.request.signal), {
        status: 200,
        headers: {
            "content-type": "application/x-ndjson",
            "cache-control": "no-store",
            ...input.headers,
        },
    });
});
export const incompatibleReplicationResponse = (headers) => new Response(`${encodeReplicationFrame({
    type: "TerminalError",
    protocol: REPLICATION_PROTOCOL_VERSION,
    code: "incompatible-version",
})}\n`, {
    status: 409,
    headers: {
        "content-type": "application/x-ndjson",
        "cache-control": "no-store",
        ...headers,
    },
});
export const updateRequiredReplicationResponse = (headers) => new Response(`${encodeReplicationFrame({
    type: "TerminalError",
    protocol: REPLICATION_PROTOCOL_VERSION,
    code: "update-required",
})}\n`, {
    status: 409,
    headers: {
        "content-type": "application/x-ndjson",
        "cache-control": "no-store",
        ...headers,
    },
});
//# sourceMappingURL=authorized-replication.js.map