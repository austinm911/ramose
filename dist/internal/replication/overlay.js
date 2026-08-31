import { Index, ValueTag, datom as makeDatom, valueEquals, } from "../core/datom.js";
import { Db } from "../core/db.js";
import { Novelty } from "../core/novelty.js";
import { RAMOSE_TYPE } from "../core/schema.js";
import { isClientRef, } from "../../db/refs.js";
import { replicaFactDatom } from "./replica-schema.js";
const asLogical = (entity, field, value) => ({ entity, field, value, op: "add" });
const storedMembershipType = (ns) => ns.startsWith(":") ? ns : `:${ns}`;
const referencesOf = (op) => (op.op === "set" || op.op === "remove") && op.value !== null &&
    op.value.type === "ref"
    ? [op.entity, op.value.value]
    : [op.entity];
export const projectOverlay = async (committed, layers, resolver) => {
    if (committed.asOfT !== undefined || committed.isHistory) {
        throw new Error("ramose/overlay: the speculative overlay applies only to a live committed value");
    }
    const schema = committed.schema;
    const entities = new Map();
    const speculative = new Map();
    const refusals = [];
    let nextEid = committed.nextEid;
    let declared = new Set();
    const resolve = (ref) => {
        if (isClientRef(ref)) {
            const mapped = resolver.mapping(ref);
            if (mapped === undefined && !declared.has(ref))
                return "undeclared-ref";
            const direct = entities.get(ref);
            if (direct !== undefined)
                return direct;
            const key = mapped ?? ref;
            let eid = entities.get(key);
            if (eid === undefined) {
                const held = mapped === undefined ? undefined : resolver.entity(mapped);
                eid = held ?? nextEid++;
                entities.set(key, eid);
                if (held === undefined)
                    speculative.set(key, eid);
            }
            entities.set(ref, eid);
            return eid;
        }
        const direct = entities.get(ref);
        if (direct !== undefined)
            return direct;
        const eid = resolver.entity(ref);
        if (eid === undefined)
            return "unknown-entity";
        entities.set(ref, eid);
        return eid;
    };
    for (const layer of layers) {
        declared = new Set(layer.declared);
        for (const op of layer.changeset) {
            for (const ref of referencesOf(op))
                if (isClientRef(ref))
                    resolve(ref);
        }
    }
    const lower = (op, value, e, t) => {
        const fact = replicaFactDatom(asLogical(op.entity, op.field, value), schema, entities);
        if (typeof fact === "string")
            return fact;
        try {
            return makeDatom(e, fact.a, fact.vt, fact.v, t, true);
        }
        catch {
            return "value-type";
        }
    };
    const derive = (novelty, basisT) => new Db({
        store: committed.store,
        roots: committed.roots,
        novelty,
        basisT,
        schema,
        nextEid,
        asOfT: committed.asOfT,
        history: committed.isHistory,
        filters: committed.filters,
        composition: committed.composition,
    });
    const isAvet = (a) => schema.isAvet(a);
    const isVaet = (a) => schema.isVaet(a);
    const novelty = new Novelty();
    novelty.add(committed.novelty.byIndex[Index.EAVT].all(), isAvet, isVaet);
    let below = committed;
    let t = committed.basisT;
    const datomsFor = async (op, at) => {
        const resolved = referencesOf(op).map(resolve);
        const refused = resolved.find((eid) => typeof eid === "string");
        if (refused !== undefined)
            return refused;
        const e = resolved[0];
        const retract = (prior) => ({ ...prior, t: at, op: false });
        if (op.op === "create") {
            return [
                makeDatom(e, RAMOSE_TYPE, ValueTag.Str, storedMembershipType(op.type), at, true),
            ];
        }
        if (op.op === "delete") {
            const own = await below.datomsArray(Index.EAVT, { e });
            const inbound = await below.datomsArray(Index.VAET, {
                vt: ValueTag.Ref,
                v: e,
            });
            return [...own, ...inbound].map(retract);
        }
        const attribute = schema.attr(op.field);
        if (attribute === undefined)
            return "unknown-field";
        const current = await below.datomsArray(Index.EAVT, { e, a: attribute.id });
        if (op.op === "remove") {
            if (op.value === null)
                return current.map(retract);
            const target = lower(op, op.value, e, at);
            if (typeof target === "string")
                return target;
            return current
                .filter((prior) => valueEquals(prior.vt, prior.v, target.vt, target.v))
                .map(retract);
        }
        const fact = lower(op, op.value, e, at);
        if (typeof fact === "string")
            return fact;
        const emitted = attribute.cardinality === "one"
            ? current
                .filter((prior) => !valueEquals(prior.vt, prior.v, fact.vt, fact.v))
                .map(retract)
            : [];
        emitted.push(fact);
        return emitted;
    };
    for (const layer of layers) {
        declared = new Set(layer.declared);
        for (let index = 0; index < layer.changeset.length; index++) {
            const emitted = await datomsFor(layer.changeset[index], t + 1);
            if (typeof emitted === "string") {
                refusals.push(Object.freeze({
                    invocation: layer.invocation,
                    index,
                    reason: emitted,
                }));
                continue;
            }
            if (emitted.length === 0)
                continue;
            t += 1;
            novelty.add(emitted, isAvet, isVaet);
            below = derive(novelty, t);
        }
    }
    return Object.freeze({
        db: t === committed.basisT ? committed : derive(novelty, t),
        speculative,
        refusals: Object.freeze(refusals),
    });
};
//# sourceMappingURL=overlay.js.map