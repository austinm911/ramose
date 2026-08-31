import * as Data from "effect/Data";
import * as Result from "effect/Result";
export const emptyEntityHandles = new Map();
export class ReplicationTransitionError extends Data.TaggedError("ReplicationTransitionError") {
}
export const emptyClientReplicationState = () => ({
    closed: false,
});
export const sameReplicationIdentity = (left, right) => left.version === right.version &&
    left.server === right.server &&
    left.principal === right.principal &&
    left.database === right.database &&
    left.catalog === right.catalog &&
    left.readView === right.readView &&
    left.readCompatibilityHash === right.readCompatibilityHash &&
    left.graphLineage.length === right.graphLineage.length &&
    left.graphLineage.every((entity, index) => entity === right.graphLineage[index]) &&
    left.authenticator === right.authenticator;
const factKey = (datom) => JSON.stringify([datom.entity, datom.field, datom.value]);
const sameDatomList = (left, right) => left.length === right.length &&
    left.every((datom, index) => JSON.stringify(datom) === JSON.stringify(right[index]));
const fail = (reason) => Result.fail(new ReplicationTransitionError({ reason }));
const requireIdentity = (state, identity) => state.identity !== undefined &&
    sameReplicationIdentity(state.identity, identity)
    ? Result.succeed(undefined)
    : fail("frame identity does not match the active partition");
const mergeHandles = (prior, bindings) => {
    let merged;
    let claimed;
    const current = () => merged ?? prior;
    for (const binding of bindings) {
        const existing = current().get(binding.entity);
        if (existing === binding.handle)
            continue;
        if (existing !== undefined)
            return undefined;
        claimed ??= new Set(current().values());
        if (claimed.has(binding.handle))
            return undefined;
        claimed.add(binding.handle);
        merged ??= new Map(prior);
        merged.set(binding.entity, binding.handle);
    }
    return merged ?? prior;
};
const retainHandles = (handles, datoms) => {
    const kept = new Map();
    const keep = (entity) => {
        const handle = handles.get(entity);
        if (handle !== undefined)
            kept.set(entity, handle);
    };
    for (const datom of datoms) {
        keep(datom.entity);
        if (datom.value.type === "ref")
            keep(datom.value.value);
    }
    return kept;
};
const isValuePart = (value) => value.type === "string-part" || value.type === "bytes-part";
const commitSnapshot = (state, frame) => {
    if (state.committed?.revision === frame.revision) {
        const { staging: _, ...withoutStaging } = state;
        return Result.succeed({ ...withoutStaging, closed: false });
    }
    const staging = state.staging;
    if (staging === undefined ||
        staging.snapshot !== frame.snapshot ||
        staging.revision !== frame.revision) {
        return Result.succeed(state);
    }
    if (staging.chunks.size !== frame.chunks)
        return Result.succeed(state);
    const materialized = [];
    const groups = new Map();
    let order = 0;
    for (let index = 0; index < frame.chunks; index++) {
        const chunk = staging.chunks.get(index);
        if (chunk === undefined)
            return Result.succeed(state);
        for (const datom of chunk) {
            if (!isValuePart(datom.value)) {
                materialized.push({
                    order,
                    datom: { ...datom, value: datom.value },
                });
                order++;
                continue;
            }
            const part = datom.value;
            if (part.index >= part.chunks) {
                return fail("snapshot value part index exceeds its chunk count");
            }
            if (part.type === "bytes-part" &&
                part.index + 1 < part.chunks &&
                part.value.endsWith("=")) {
                return fail("non-final byte value part has base64 padding");
            }
            const key = JSON.stringify([
                datom.entity,
                datom.field,
                part.type,
                part.identity,
            ]);
            let group = groups.get(key);
            if (group === undefined) {
                group = {
                    order,
                    entity: datom.entity,
                    field: datom.field,
                    type: part.type,
                    chunks: part.chunks,
                    values: new Map(),
                };
                groups.set(key, group);
            }
            else if (group.chunks !== part.chunks) {
                return fail("snapshot value parts disagree on their chunk count");
            }
            const existing = group.values.get(part.index);
            if (existing !== undefined && existing !== part.value) {
                return fail("duplicate snapshot value part changed bytes");
            }
            group.values.set(part.index, part.value);
            order++;
        }
    }
    for (const group of groups.values()) {
        if (group.values.size !== group.chunks)
            return Result.succeed(state);
        const parts = [];
        for (let index = 0; index < group.chunks; index++) {
            const part = group.values.get(index);
            if (part === undefined)
                return Result.succeed(state);
            parts.push(part);
        }
        materialized.push({
            order: group.order,
            datom: {
                entity: group.entity,
                field: group.field,
                value: {
                    type: group.type === "string-part" ? "string" : "bytes",
                    value: parts.join(""),
                },
                op: "add",
            },
        });
    }
    materialized.sort((left, right) => left.order - right.order);
    const datoms = materialized.map((item) => item.datom);
    const facts = new Set();
    for (const datom of datoms) {
        const key = factKey(datom);
        if (facts.has(key))
            return fail("snapshot contains a duplicate fact");
        facts.add(key);
    }
    const missing = new Set();
    for (const datom of datoms) {
        if (!staging.handles.has(datom.entity))
            missing.add(datom.entity);
        if (datom.value.type === "ref" && !staging.handles.has(datom.value.value)) {
            missing.add(datom.value.value);
        }
    }
    if (missing.size > 0)
        return fail("snapshot names an entity with no sealed handle");
    return Result.succeed({
        identity: frame.identity,
        committed: Object.freeze({
            revision: frame.revision,
            datoms: Object.freeze(datoms),
            handles: retainHandles(staging.handles, datoms),
        }),
        closed: false,
    });
};
const applyChange = (state, frame) => {
    const committed = state.committed;
    if (committed === undefined)
        return fail("change arrived before a committed value");
    if (frame.revision === committed.revision)
        return Result.succeed(state);
    if (frame.from !== committed.revision)
        return Result.succeed(state);
    const operations = new Map();
    for (const datom of frame.datoms) {
        const key = factKey(datom);
        const prior = operations.get(key);
        if (prior !== undefined && prior !== datom.op) {
            return fail("change both adds and retracts one fact");
        }
        operations.set(key, datom.op);
    }
    const handles = mergeHandles(committed.handles, frame.handles);
    if (handles === undefined)
        return fail("change rebinds an entity's sealed handle");
    const facts = new Map();
    for (const datom of committed.datoms) {
        facts.set(factKey(datom), datom);
    }
    for (const datom of frame.datoms) {
        const key = factKey(datom);
        if (datom.op === "retract")
            facts.delete(key);
        else
            facts.set(key, datom);
    }
    const datoms = Object.freeze([...facts.values()]);
    for (const datom of datoms) {
        if (!handles.has(datom.entity)) {
            return fail("change leaves an entity with no sealed handle");
        }
        if (datom.value.type === "ref" && !handles.has(datom.value.value)) {
            return fail("change leaves a referenced entity with no sealed handle");
        }
    }
    return Result.succeed({
        identity: frame.identity,
        committed: Object.freeze({
            revision: frame.revision,
            datoms,
            handles: retainHandles(handles, datoms),
        }),
        closed: false,
    });
};
export const applyReplicationFrame = (state, frame) => {
    if (state.closed)
        return Result.succeed(state);
    switch (frame.type) {
        case "Reset": {
            const same = state.identity !== undefined &&
                sameReplicationIdentity(state.identity, frame.identity);
            return Result.succeed({
                identity: frame.identity,
                ...(same && state.committed !== undefined
                    ? { committed: state.committed }
                    : {}),
                closed: false,
            });
        }
        case "SnapshotStart": {
            const same = state.identity !== undefined &&
                sameReplicationIdentity(state.identity, frame.identity);
            if (same &&
                state.staging?.snapshot === frame.snapshot &&
                state.staging.revision === frame.revision) {
                return Result.succeed({ ...state, closed: false });
            }
            return Result.succeed({
                identity: frame.identity,
                ...(same && state.committed !== undefined
                    ? { committed: state.committed }
                    : {}),
                staging: Object.freeze({
                    snapshot: frame.snapshot,
                    revision: frame.revision,
                    chunks: new Map(),
                    handles: emptyEntityHandles,
                }),
                closed: false,
            });
        }
        case "SnapshotChunk": {
            const identity = requireIdentity(state, frame.identity);
            if (Result.isFailure(identity))
                return Result.fail(identity.failure);
            const staging = state.staging;
            if (staging === undefined || staging.snapshot !== frame.snapshot) {
                return Result.succeed(state);
            }
            const handles = mergeHandles(staging.handles, frame.handles);
            if (handles === undefined) {
                return fail("snapshot chunks disagree on an entity's sealed handle");
            }
            const existing = staging.chunks.get(frame.index);
            if (existing !== undefined) {
                return sameDatomList(existing, frame.datoms)
                    ? Result.succeed(state)
                    : fail("duplicate snapshot chunk changed bytes");
            }
            const chunks = new Map(staging.chunks);
            chunks.set(frame.index, Object.freeze([...frame.datoms]));
            return Result.succeed({
                ...state,
                staging: Object.freeze({ ...staging, chunks, handles }),
            });
        }
        case "SnapshotCommit": {
            const identity = requireIdentity(state, frame.identity);
            return Result.isFailure(identity)
                ? Result.fail(identity.failure)
                : commitSnapshot(state, frame);
        }
        case "Change": {
            const identity = requireIdentity(state, frame.identity);
            return Result.isFailure(identity)
                ? Result.fail(identity.failure)
                : applyChange(state, frame);
        }
        case "ResumeReady": {
            const identity = requireIdentity(state, frame.identity);
            if (Result.isFailure(identity))
                return Result.fail(identity.failure);
            if (state.committed?.revision !== frame.revision) {
                return fail("resume-ready revision does not match the committed value");
            }
            return Result.succeed(state);
        }
        case "KeepAlive": {
            const identity = requireIdentity(state, frame.identity);
            return Result.isFailure(identity)
                ? Result.fail(identity.failure)
                : Result.succeed(state);
        }
        case "TerminalError": {
            const same = frame.identity === undefined || state.identity === undefined ||
                sameReplicationIdentity(state.identity, frame.identity);
            return Result.succeed({
                ...(same && state.identity !== undefined
                    ? { identity: state.identity }
                    : frame.identity === undefined
                        ? {}
                        : { identity: frame.identity }),
                ...(same && state.committed !== undefined
                    ? { committed: state.committed }
                    : {}),
                closed: true,
            });
        }
    }
};
//# sourceMappingURL=state.js.map