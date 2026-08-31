import { isComposer } from "../Composer.js";
import { entities, ids as idsStage, is, limit as limitStage, offset as offsetStage, select as selectStage, } from "./lib.js";
import {} from "./kernel.js";
import { makeQueryObject, } from "./query.js";
const entityId = (ns) => ns.id;
const refTargetEntity = (field, source) => {
    const schema = field.schema;
    if (schema?._self === true)
        return source;
    const resolve = schema?._resolve;
    if (typeof resolve !== "function")
        return source;
    const target = resolve();
    if (isComposer(target))
        return target;
    return source;
};
export const entityShape = (ns) => {
    const sourceId = entityId(ns);
    const out = { id: sourceId };
    for (const [key, field] of Object.entries(ns.fields)) {
        const f = field;
        if (f.valueType === "ref") {
            const nested = f.select({ id: entityId(refTargetEntity(f, ns)) });
            out[key] = f.cardinality === "many" ? nested : nested.optional;
        }
        else {
            out[key] = f.cardinality === "many" ? field : f.optional;
        }
    }
    return out;
};
const withDefaultShape = (pipe) => {
    if (pipe.stages.some((s) => s.kind === "select" || s.kind === "ids"))
        return pipe;
    const idx = pipe.stages.findIndex((s) => s.kind === "orderBy" || s.kind === "limit" || s.kind === "offset");
    const head = idx === -1 ? pipe : { ...pipe, stages: pipe.stages.slice(0, idx) };
    const next = selectStage(entityShape(pipe.ns))(head);
    return idx === -1 ? next : { ...next, stages: [...next.stages, ...pipe.stages.slice(idx)] };
};
const EQ_CLAUSE = new WeakMap();
const applyEq = (pipe, ns, eq) => {
    const kept = [...pipe.stages];
    const prior = [];
    while (kept.length > 0) {
        const last = kept[kept.length - 1];
        const clause = EQ_CLAUSE.get(last);
        if (clause === undefined)
            break;
        kept.pop();
        prior.unshift(clause);
    }
    const added = Object.keys(eq).map((key) => ({ key, value: eq[key] }));
    const all = [...prior, ...added].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    let next = kept.length === pipe.stages.length ? pipe : { ...pipe, stages: kept };
    for (const { key, value } of all) {
        const attr = key === "id" ? entityId(ns) : ns.fields[key];
        if (attr === undefined) {
            throw new Error(`ramose/query: where({ ${key} }) — "${ns.ns}" has no field "${key}"`);
        }
        next = is(attr, value)(next);
        EQ_CLAUSE.set(next.stages[next.stages.length - 1], { key, value });
    }
    return next;
};
const applyStages = (pipe, stages) => {
    let next = pipe;
    for (const stage of stages)
        next = stage(next);
    return next;
};
const makeFluent = (ns, pipe, stripCursor, take, seek, orders = [], limitN, offsetN) => {
    const qv = makeQueryObject(() => withDefaultShape(pipe), stripCursor, take, seek, orders, limitN, offsetN);
    const next = (nextPipe) => makeFluent(ns, nextPipe, stripCursor, take, seek, orders, limitN, offsetN);
    const fluent = qv;
    fluent.where = ((arg, ...rest) => {
        if (arg === undefined && rest.length === 0) {
            throw new Error("ramose/query: where() takes an equality object or one or more filter stages");
        }
        if (typeof arg === "function") {
            return next(applyStages(pipe, [arg, ...rest]));
        }
        return next(applyEq(pipe, ns, arg));
    });
    fluent.select = ((shape, extra) => extra === undefined
        ? next(selectStage(shape)(pipe))
        : next(selectStage(shape, extra)(pipe)));
    fluent.orderBy = (key, dir, opts) => makeFluent(ns, pipe, stripCursor, take, seek, [
        ...orders,
        { key, dir: dir ?? "asc", empty: opts?.empty ?? "last" },
    ], limitN, offsetN);
    fluent.limit = ((n) => next(limitStage(n)(pipe)));
    fluent.offset = ((n) => next(offsetStage(n)(pipe)));
    fluent.ids = () => makeFluent(ns, idsStage()(pipe), stripCursor, take, seek, orders, limitN, offsetN);
    const baseOne = qv.one.bind(qv);
    const baseFail = qv.oneOrFail.bind(qv);
    const baseAfter = qv.after.bind(qv);
    fluent.one = () => {
        const taken = baseOne();
        return makeFluent(ns, pipe, taken.stripCursor, taken.take, taken.seek, taken.orders, taken.limitN, taken.offsetN);
    };
    fluent.oneOrFail = () => {
        const taken = baseFail();
        return makeFluent(ns, pipe, taken.stripCursor, taken.take, taken.seek, taken.orders, taken.limitN, taken.offsetN);
    };
    fluent.after = (cursor) => {
        const paged = baseAfter(cursor);
        return makeFluent(ns, pipe, paged.stripCursor, paged.take, paged.seek, paged.orders, paged.limitN, paged.offsetN);
    };
    fluent.logic = () => makeFluent(ns, pipe, true);
    return fluent;
};
/**
 * Start a fluent query at an entity. Select-less, the row is the full
 * entity (friendly keys); `.select` narrows, `.ids` keeps today's id-only
 * cheap subscription. Put changing values in `.where` — two independently
 * built queries with the same literals share a live subscription.
 */
export const from = (ns) => {
    if (!isComposer(ns)) {
        throw new Error("ramose/query: Query.from(...) takes an entity or trait");
    }
    return makeFluent(ns, entities(ns), false);
};
//# sourceMappingURL=fluent.js.map