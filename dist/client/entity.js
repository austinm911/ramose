import * as Data from "effect/Data";
import { isClientRef } from "../db/refs.js";
import { mutationNamespace } from "./mutation.js";
const SETTLED = Object.freeze({ pending: false, created: false });
/**
 * Mutating an entity whose partition this client no longer holds.
 *
 * A principal replacement, a read-view reset or a close withdraws every handle
 * that partition produced. The handle keeps saying what the entity was — a
 * rendered list must not turn into holes — but its target means nothing in the
 * partition that replaced it, so the call is refused here rather than queued
 * against a receiver that never held it.
 */
export class EntityWithdrawnError extends Data.TaggedError("EntityWithdrawnError") {
}
export class EntityRegistry {
    context;
    database;
    operations;
    handles = new Map();
    aliases = new Map();
    reverse = new Map();
    views = new Map();
    pending = new Map();
    constructor(context, database, operations) {
        this.context = context;
        this.database = database;
        this.operations = operations;
    }
    observe(pending) {
        this.pending = pending;
        const moved = new Set();
        for (const handle of this.handles.values()) {
            if (handle.apply(this.stateFor(handle.id)))
                moved.add(handle);
        }
        return moved;
    }
    alias(ref, id) {
        if (this.aliases.get(ref) === id)
            return;
        this.aliases.set(ref, id);
        this.reverse.set(id, [...(this.reverse.get(id) ?? []), ref]);
        const views = this.views.get(ref) ?? [];
        for (const view of views) {
            const existing = this.handles.get(`${view}\u0000${ref}`);
            if (existing === undefined)
                continue;
            existing.rename(id);
            this.handles.set(`${view}\u0000${id}`, existing);
        }
        this.views.set(id, [...(this.views.get(id) ?? []), ...views]);
    }
    handle(id, focus, shape, data) {
        const identity = this.aliases.get(id) ?? id;
        const view = `${focus._tag}:${focus.ns}\u0000${shape}`;
        const key = `${view}\u0000${identity}`;
        const existing = this.handles.get(key);
        if (existing !== undefined) {
            existing.update(data);
            return existing;
        }
        const handle = new LiveHandle(identity, data, mutationNamespace(this.context, this.database, this.operations(focus), identity));
        handle.apply(this.stateFor(identity));
        this.handles.set(key, handle);
        this.views.set(identity, [...(this.views.get(identity) ?? []), view]);
        return handle;
    }
    stateFor(identity) {
        for (const name of [identity, ...(this.reverse.get(identity) ?? [])]) {
            const entry = this.pending.get(name);
            if (entry !== undefined) {
                return Object.freeze({ pending: true, created: entry.created });
            }
        }
        return SETTLED;
    }
    clear() {
        for (const handle of this.handles.values())
            handle.withdraw();
        this.handles.clear();
        this.aliases.clear();
        this.reverse.clear();
        this.views.clear();
        this.pending = new Map();
    }
}
class LiveHandle {
    #id;
    #data;
    #local = SETTLED;
    #withdrawn = false;
    mutate;
    constructor(id, data, live) {
        this.#id = id;
        this.#data = data;
        const methods = {};
        for (const [name, method] of Object.entries(live)) {
            methods[name] = (input) => {
                if (this.#withdrawn) {
                    throw new EntityWithdrawnError({ operation: name });
                }
                return method(input);
            };
        }
        this.mutate = Object.freeze(methods);
    }
    get id() {
        return this.#id;
    }
    get data() {
        return this.#data;
    }
    get local() {
        return this.#local;
    }
    update(data) {
        this.#data = data;
    }
    rename(id) {
        this.#id = id;
    }
    apply(next) {
        if (next.pending === this.#local.pending && next.created === this.#local.created)
            return false;
        this.#local = next;
        return true;
    }
    withdraw() {
        this.#withdrawn = true;
        this.#local = SETTLED;
    }
}
export const rowIdentity = (row) => {
    if (row === null || typeof row !== "object")
        return undefined;
    const id = row.id;
    return typeof id === "string" ? id : undefined;
};
export const isLocalIdentity = (id) => isClientRef(id);
//# sourceMappingURL=entity.js.map