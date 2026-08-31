import * as Clock from "effect/Clock";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Stream from "effect/Stream";
import { Unauthorized } from "../../db/Errors.js";
import { stringifyJson } from "../core/json.js";
import { MAX_READ_LEASE_MS } from "./bounds.js";
import { constructAuthorizedRequestContext, } from "./request.js";
import { OneShotReadError, runOneShotRead, } from "./reads.js";
const deny = () => new Unauthorized({});
const ABSENT = Symbol("ramose/live/absent");
const leaseLimit = (interruptAfter) => Duration.min(Duration.fromInputUnsafe(interruptAfter ?? MAX_READ_LEASE_MS), Duration.millis(MAX_READ_LEASE_MS));
const callerLease = (caller, nowMs, limit) => {
    if (!Number.isSafeInteger(caller.exp))
        return Result.fail(deny());
    const remainingMs = caller.exp * 1_000 - nowMs;
    if (remainingMs <= 0)
        return Result.fail(deny());
    const duration = Duration.min(limit, Duration.millis(remainingMs));
    return Result.succeed({ duration, expiresAtMs: nowMs + Duration.toMillis(duration) });
};
const principalLeaseIdentity = (caller) => stringifyJson({
    claims: caller.claims,
    classes: [...caller.classes].sort(),
});
const atBoundary = (boundaries, name) => boundaries === undefined
    ? Effect.void
    : Effect.tryPromise({
        try: () => boundaries.checkpoint(name),
        catch: () => deny(),
    });
export const liveResultRows = (value) => {
    if (value === null || value === undefined)
        return [];
    return Array.isArray(value) ? value : [value];
};
export const isSilentLiveDiff = (diff) => diff.added.length === 0 && diff.retracted.length === 0;
export const diffAuthorizedResults = (previous, next) => {
    const prevRows = liveResultRows(previous);
    const nextRows = liveResultRows(next);
    const prevCounts = new Map();
    const nextCounts = new Map();
    for (const row of prevRows) {
        const key = stringifyJson(row);
        prevCounts.set(key, (prevCounts.get(key) ?? 0) + 1);
    }
    for (const row of nextRows) {
        const key = stringifyJson(row);
        nextCounts.set(key, (nextCounts.get(key) ?? 0) + 1);
    }
    const added = [];
    const retracted = [];
    const remainingPrev = new Map(prevCounts);
    for (const row of nextRows) {
        const key = stringifyJson(row);
        const remaining = remainingPrev.get(key) ?? 0;
        if (remaining === 0)
            added.push(row);
        else
            remainingPrev.set(key, remaining - 1);
    }
    const remainingNext = new Map(nextCounts);
    for (const row of prevRows) {
        const key = stringifyJson(row);
        const remaining = remainingNext.get(key) ?? 0;
        if (remaining === 0)
            retracted.push(row);
        else
            remainingNext.set(key, remaining - 1);
    }
    const reconstructed = [...prevRows];
    for (const row of retracted) {
        const key = stringifyJson(row);
        const index = reconstructed.findIndex((candidate) => stringifyJson(candidate) === key);
        if (index !== -1)
            reconstructed.splice(index, 1);
    }
    reconstructed.push(...added);
    const reconstructedOrder = reconstructed.map(stringifyJson);
    const nextOrder = nextRows.map(stringifyJson);
    if (reconstructedOrder.length !== nextOrder.length ||
        reconstructedOrder.some((key, index) => key !== nextOrder[index])) {
        return { added: nextRows, retracted: prevRows };
    }
    return { added, retracted };
};
export const liveDiffFromPrevious = (previous, next) => previous === undefined ? { added: liveResultRows(next), retracted: [] } : diffAuthorizedResults(previous, next);
const remainingOf = (expiresAtMs, nowMs) => Duration.millis(Math.max(0, expiresAtMs - nowMs));
const waitWakeOrLease = (wakes, remaining) => {
    if (Duration.toMillis(remaining) <= 0)
        return Effect.succeed(false);
    return Effect.race(Queue.take(wakes).pipe(Effect.as(true)), Effect.sleep(remaining).pipe(Effect.as(false)));
};
const readAuthorized = (db, read, opts) => Effect.tryPromise({
    try: () => runOneShotRead(db, read, opts),
    catch: (cause) => new OneShotReadError({ cause }),
});
const deliverSnapshot = (item) => Effect.gen(function* () {
    yield* atBoundary(item.boundaries, "live.emit");
    const nowMs = yield* Clock.currentTimeMillis;
    const current = yield* Ref.get(item.epoch);
    if (item.id !== current || nowMs >= item.expiresAtMs)
        return Result.fail(undefined);
    const sent = yield* Ref.get(item.lastSent);
    const initial = sent === ABSENT;
    const diff = initial
        ? liveDiffFromPrevious(undefined, item.value)
        : diffAuthorizedResults(sent, item.value);
    if (!initial && isSilentLiveDiff(diff)) {
        yield* Ref.set(item.lastSent, item.value);
        return Result.fail(undefined);
    }
    const still = yield* Ref.get(item.epoch);
    const again = yield* Clock.currentTimeMillis;
    if (still !== item.id || again >= item.expiresAtMs)
        return Result.fail(undefined);
    yield* Ref.set(item.lastSent, item.value);
    return Result.succeed(diff);
});
export const executeAuthorizedLiveLease = (input, read, opts = {}) => Stream.callback((out) => Effect.gen(function* () {
    const wakes = yield* Queue.dropping(1);
    const basisReady = yield* Deferred.make();
    const epoch = yield* Ref.make(0);
    const lastSent = yield* Ref.make(input.previous === undefined ? ABSENT : input.previous);
    const limit = leaseLimit(input.interruptAfter);
    const invalidate = Ref.update(epoch, (id) => id + 1);
    const signalBasisChange = invalidate.pipe(Effect.andThen(Queue.offer(wakes, undefined)), Effect.asVoid);
    if (input.wakes !== undefined) {
        const external = input.wakes;
        yield* Effect.forkChild(Effect.forever(Queue.take(external).pipe(Effect.andThen(signalBasisChange))));
    }
    const revoked = input.revoked === undefined
        ? Effect.never
        : Deferred.await(input.revoked).pipe(Effect.andThen(invalidate), Effect.andThen(Effect.fail(deny())));
    const close = Queue.end(out).pipe(Effect.asVoid);
    const recompute = (filteredDb, id, expiresAtMs) => Effect.gen(function* () {
        const nowMs = yield* Clock.currentTimeMillis;
        if (nowMs >= expiresAtMs)
            return;
        const value = yield* readAuthorized(filteredDb, read, opts);
        yield* atBoundary(input.boundaries, "live.recompute");
        const current = yield* Ref.get(epoch);
        if (current !== id)
            return;
        yield* atBoundary(input.boundaries, "live.enqueue");
        const still = yield* Ref.get(epoch);
        const enqueueNow = yield* Clock.currentTimeMillis;
        if (still !== id || enqueueNow >= expiresAtMs)
            return;
        yield* Queue.offer(out, {
            id,
            expiresAtMs,
            value,
            epoch,
            lastSent,
            ...(input.boundaries === undefined
                ? {}
                : { boundaries: input.boundaries }),
        });
    });
    const leaseLoop = Effect.gen(function* () {
        let firstLease = true;
        let basisChanged = true;
        let principalIdentity;
        while (true) {
            if (!firstLease && input.renew !== undefined) {
                const currentDeployment = yield* input.renew.pipe(Effect.mapError(() => deny()), Effect.result);
                if (Result.isFailure(currentDeployment))
                    return;
            }
            const admitted = yield* input.authenticate.pipe(Effect.mapError(() => deny()), Effect.result);
            if (Result.isFailure(admitted))
                return;
            const caller = admitted.success;
            const identity = principalLeaseIdentity(caller);
            if (principalIdentity === undefined)
                principalIdentity = identity;
            else if (principalIdentity !== identity)
                return;
            const nowMs = yield* Clock.currentTimeMillis;
            const lease = yield* Effect.fromResult(callerLease(caller, nowMs, limit));
            const id = yield* Ref.updateAndGet(epoch, (n) => n + 1);
            const tickNow = yield* Clock.currentTimeMillis;
            if (tickNow < lease.expiresAtMs &&
                (basisChanged || input.reauthorizeOnIdle === true)) {
                const leaseWork = input.authorize(caller).pipe(Effect.flatMap((filteredDb) => basisChanged
                    ? recompute(filteredDb, id, lease.expiresAtMs)
                    : Effect.void), Effect.timeoutOrElse({
                    duration: remainingOf(lease.expiresAtMs, tickNow),
                    orElse: () => Effect.fail(deny()),
                }), Effect.result);
                if (Result.isFailure(yield* leaseWork))
                    return;
            }
            const after = yield* Clock.currentTimeMillis;
            basisChanged = after < lease.expiresAtMs
                ? yield* waitWakeOrLease(wakes, remainingOf(lease.expiresAtMs, after))
                : false;
            yield* invalidate;
            firstLease = false;
        }
    });
    const basisWatch = input.basisChanges === undefined
        ? Effect.never
        : Stream.runForEach(input.basisChanges, (event) => event === "ready"
            ? Deferred.succeed(basisReady, undefined).pipe(Effect.asVoid)
            : Deferred.succeed(basisReady, undefined).pipe(Effect.andThen(signalBasisChange), Effect.asVoid)).pipe(Effect.mapError(() => deny()), Effect.andThen(Effect.fail(deny())));
    const leaseAndBasis = input.basisChanges === undefined
        ? Effect.raceFirst(leaseLoop, revoked)
        : Effect.raceFirst(basisWatch, Deferred.await(basisReady).pipe(Effect.andThen(Effect.raceFirst(leaseLoop, revoked))));
    const invalidationWatch = input.invalidations === undefined
        ? Effect.never
        : Stream.runForEach(input.invalidations, () => signalBasisChange).pipe(Effect.mapError(() => deny()), Effect.andThen(Effect.fail(deny())));
    const authorizedLoop = input.invalidations === undefined
        ? leaseAndBasis
        : Effect.raceFirst(leaseAndBasis, invalidationWatch);
    yield* authorizedLoop.pipe(Effect.result, Effect.andThen(invalidate), Effect.andThen(close), Effect.onInterrupt(() => invalidate.pipe(Effect.andThen(Queue.shutdown(out)), Effect.asVoid)));
}), { bufferSize: 1, strategy: "suspend" }).pipe(Stream.filterMapEffect(deliverSnapshot));
export const executeAuthorizedLive = (input, read, opts = {}) => executeAuthorizedLiveLease({
    ...input,
    authorize: (caller) => constructAuthorizedRequestContext(input, caller).pipe(Effect.map((context) => context.filteredDb)),
}, read, opts);
//# sourceMappingURL=live.js.map