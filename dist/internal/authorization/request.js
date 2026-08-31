import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { Unauthorized } from "../../db/Errors.js";
import { Index } from "../core/datom.js";
import { RAMOSE_TYPE } from "../core/schema.js";
import { MAX_READ_LEASE_MS } from "./bounds.js";
import { compositionFromUnit } from "./composition.js";
import { InvalidResolvedDatabaseRoute, acquireResolvedDatabase, opaqueDatabaseBindingDenial, resolveBoundCatalogDefinition, } from "./database-bindings.js";
import { opaqueCatalogDenial, resolveDeployedCatalog, } from "./deployed.js";
import { EntityId } from "./identities.js";
import { compileReadFilter, uniqueCanonicalTypeName } from "./read-filter.js";
import { prepareAuthorizationCatalog } from "./validation/catalog.js";
const deny = () => new Unauthorized({});
export const callerFromVerified = (verified) => {
    const sub = verified.principal.sub;
    const attrs = verified.principal.claims.attrs;
    const claims = {};
    if (attrs !== undefined) {
        for (const [key, value] of Object.entries(attrs)) {
            claims[key] = value;
        }
    }
    if (sub !== undefined && sub.length > 0)
        claims.sub = sub;
    return {
        claims,
        classes: verified.principal.classes ?? [verified.principal.class],
        exp: verified.exp,
    };
};
const leaseDuration = (exp, nowMs, limit) => {
    if (!Number.isSafeInteger(exp))
        return Result.fail(deny());
    const remainingMs = exp * 1_000 - nowMs;
    if (remainingMs <= 0)
        return Result.fail(deny());
    return Result.succeed(Duration.min(limit, Duration.millis(remainingMs)));
};
const selectSubject = (caller, unit) => {
    const value = caller.claims[unit.policy.principal.subjectClaim];
    if (typeof value !== "string" || value.trim().length === 0)
        return Result.fail(deny());
    return Result.succeed(value);
};
const matchesScalar = (value, valueType) => {
    switch (valueType) {
        case "string":
            return typeof value === "string";
        case "long":
            return typeof value === "number" && Number.isSafeInteger(value);
        case "double":
            return typeof value === "number" && Number.isFinite(value);
        case "boolean":
            return typeof value === "boolean";
    }
};
const matchesClaimShape = (value, shape) => {
    if (shape._tag === "scalar")
        return matchesScalar(value, shape.valueType);
    return Array.isArray(value) && value.every((item) => matchesScalar(item, shape.items.valueType));
};
const validateCallerClaims = (claims, vocabulary) => {
    for (const descriptor of vocabulary) {
        if (!Object.hasOwn(claims, descriptor.key)) {
            if (!descriptor.optional)
                return Result.fail(deny());
            continue;
        }
        if (!matchesClaimShape(claims[descriptor.key], descriptor.shape)) {
            return Result.fail(deny());
        }
    }
    return Result.succeed(undefined);
};
const resolveMe = async (unit, subject, caller, currentDb) => {
    const principal = {
        subject,
        claims: caller.claims,
        classes: [...caller.classes],
    };
    const field = unit.policy.principal.entity;
    if (field === undefined)
        return Result.succeed(principal);
    const eid = await currentDb.entid([`:${field.owner.name}/${field.localName}`, subject]);
    if (eid === undefined)
        return Result.succeed(principal);
    const typeDatoms = await currentDb.datomsArray(Index.EAVT, { e: eid, a: RAMOSE_TYPE });
    const name = uniqueCanonicalTypeName(typeDatoms);
    if (name === undefined || name !== field.owner.name)
        return Result.fail(deny());
    const catalogEntity = unit.catalog.entities.find((entity) => entity.id.name === name);
    if (catalogEntity === undefined || catalogEntity.id.catalog !== field.catalog) {
        return Result.fail(deny());
    }
    return Result.succeed({
        ...principal,
        me: {
            entity: EntityId.make({ catalog: field.catalog, name }),
            eid,
        },
    });
};
const requestedView = (current, view) => {
    let db = current;
    if (typeof view?.asOf === "number")
        db = db.asOf(view.asOf);
    if (view?.history === true)
        db = db.history();
    return db;
};
const catalogTargetOf = (unit) => ({
    database: unit.catalog.database,
    catalog: unit.catalog.id,
    catalogVersion: unit.catalog.version,
    schemaFingerprint: unit.catalog.fingerprint,
});
const requirePreparedUnit = (unit) => {
    try {
        if (unit.policy == null)
            return Result.fail(deny());
        const prepared = prepareAuthorizationCatalog(catalogTargetOf(unit), unit.catalog);
        if (Result.isFailure(prepared))
            return Result.fail(deny());
        return Result.succeed(undefined);
    }
    catch {
        return Result.fail(deny());
    }
};
const compilePredicate = (unit, principal, currentDb) => {
    try {
        return Result.succeed(compileReadFilter({ unit, principal, currentDb }));
    }
    catch {
        return Result.fail(deny());
    }
};
const admitCatalogCaller = (unit, caller) => Effect.gen(function* () {
    yield* Effect.fromResult(requirePreparedUnit(unit));
    const subject = yield* Effect.fromResult(selectSubject(caller, unit));
    yield* Effect.fromResult(validateCallerClaims(caller.claims, unit.policy.claims));
    return { unit, subject };
}).pipe(Effect.catchCause(() => Effect.fail(deny())));
const admitDeployedCaller = (input, caller) => Effect.gen(function* () {
    const deployed = yield* Effect.fromResult(resolveDeployedCatalog(input.catalogs, {
        database: input.routeDatabase,
        catalogKey: input.catalogKey,
        unitHash: input.unitHash,
    })).pipe(Effect.mapError(opaqueCatalogDenial));
    return yield* admitCatalogCaller(deployed.unit, caller);
}).pipe(Effect.catchCause(() => Effect.fail(deny())));
const bindReadPredicate = (unit, subject, caller, current) => Effect.gen(function* () {
    const resolved = yield* Effect.tryPromise({
        try: () => resolveMe(unit, subject, caller, current),
        catch: () => deny(),
    });
    const principal = yield* Effect.fromResult(resolved);
    const predicate = yield* Effect.fromResult(compilePredicate(unit, principal, current));
    return { principal, predicate };
}).pipe(Effect.catchCause(() => Effect.fail(deny())));
const constructFilteredContext = (admitted, caller, currentDb, view) => Effect.gen(function* () {
    const composition = yield* Effect.fromResult(compositionFromUnit(admitted.unit)).pipe(Effect.mapError(() => deny()));
    const current = currentDb.withComposition(composition);
    const bound = yield* bindReadPredicate(admitted.unit, admitted.subject, caller, current);
    return {
        unit: admitted.unit,
        principal: bound.principal,
        currentDb: current,
        filteredDb: requestedView(current, view).filter(bound.predicate),
    };
});
export const constructAuthorizedRequestContext = (input, caller) => Effect.gen(function* () {
    const admitted = yield* admitDeployedCaller(input, caller);
    const current = yield* input.currentDb(input.routeDatabase);
    return yield* constructFilteredContext(admitted, caller, current, input.view);
});
export const constructAuthorizedResolvedRequestContext = (input, caller) => Effect.gen(function* () {
    const resolved = yield* Effect.fromResult(resolveBoundCatalogDefinition(input.bindings, input.route)).pipe(Effect.mapError(opaqueDatabaseBindingDenial));
    const admitted = yield* admitCatalogCaller(resolved.definition.unit, caller);
    const current = yield* acquireResolvedDatabase(input.bindings, input.route, input.currentDb).pipe(Effect.mapError((error) => error instanceof InvalidResolvedDatabaseRoute
        ? opaqueDatabaseBindingDenial(error)
        : error));
    return yield* constructFilteredContext(admitted, caller, current, input.view);
});
export const executeWithinAuthorizedLease = (input, execute) => {
    const limit = Duration.fromInputUnsafe(input.interruptAfter ?? MAX_READ_LEASE_MS);
    const program = Effect.gen(function* () {
        const caller = yield* input.authenticate.pipe(Effect.mapError(() => deny()));
        const nowMs = yield* Clock.currentTimeMillis;
        const duration = yield* Effect.fromResult(leaseDuration(caller.exp, nowMs, limit));
        return yield* execute(caller).pipe(Effect.timeoutOrElse({
            duration,
            orElse: () => Effect.fail(deny()),
        }));
    });
    return program.pipe(Effect.timeoutOrElse({
        duration: limit,
        orElse: () => Effect.fail(deny()),
    }), Effect.catchCause((cause) => Cause.hasInterrupts(cause) ? Effect.fail(deny()) : Effect.failCause(cause)));
};
export const executeAuthorizedRequest = Effect.fn("Authorization.executeAuthorizedRequest")(function* (input, execute) {
    return yield* executeWithinAuthorizedLease(input, (caller) => constructAuthorizedRequestContext(input, caller).pipe(Effect.flatMap((context) => execute(context.filteredDb))));
});
export const executeAuthorizedResolvedRequest = Effect.fn("Authorization.executeAuthorizedResolvedRequest")(function* (input, execute) {
    return yield* executeWithinAuthorizedLease(input, (caller) => constructAuthorizedResolvedRequestContext(input, caller).pipe(Effect.flatMap((context) => execute(context.filteredDb))));
});
//# sourceMappingURL=request.js.map