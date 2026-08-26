/**
 * Schema-evolution check for `install()`.
 *
 * `schemaTx` is an unconditional upsert; the peer's rebuild accepts the last
 * datom. This module diffs the desired catalog against the installed
 * attribute set and names the flips that would split the data model.
 */
import { IncompatibleSchema } from "./SchemaErrors.js";
import { Q, mkVar, q } from "./query/index.js";
const SYSTEM_PREFIX = ":db/";
export const isSystemIdent = (ident) => ident.startsWith(SYSTEM_PREFIX);
/** `:user/name` → `user`. */
export const namespaceOf = (ident) => {
    if (!ident.startsWith(":"))
        return "";
    const slash = ident.indexOf("/", 1);
    return slash < 0 ? "" : ident.slice(1, slash);
};
const CARD_MANY = ":db.cardinality/many";
export const isRequiredAttr = (attr) => attr.cardinality !== CARD_MANY && attr.optional !== true;
const identAttr = { ident: ":db/ident" };
const valueTypeAttr = { ident: ":db/valueType" };
const cardinalityAttr = { ident: ":db/cardinality" };
const uniqueAttr = { ident: ":db/unique" };
const optionalAttr = { ident: ":db/optional" };
/** Every attribute entity: ident + valueType + cardinality. */
export const installedCoreQuery = q(function* () {
    const ident = yield* Q.fact(Q._, identAttr);
    const valueType = yield* Q.fact(ident.e, valueTypeAttr);
    const cardinality = yield* Q.fact(ident.e, cardinalityAttr);
    return {
        e: ident.e,
        ident: ident.v,
        valueType: valueType.v,
        cardinality: cardinality.v,
    };
});
export const installedUniqueQuery = q(function* () {
    const unique = yield* Q.fact(Q._, uniqueAttr);
    return { e: unique.e, unique: unique.v };
});
export const installedOptionalQuery = q(function* () {
    const optional = yield* Q.fact(Q._, optionalAttr);
    return { e: optional.e, optional: optional.v };
});
/**
 * Any entity that asserts one of `idents`. `.one()` so occupancy is a
 * single row or `null`.
 */
export const occupancyQuery = (idents) => {
    const listed = idents.filter((ident) => ident.length > 0);
    return q(function* () {
        const e = mkVar("entity");
        if (listed.length === 1) {
            yield* Q.fact(e, { ident: listed[0] });
        }
        else {
            yield* Q.or(...listed.map((ident) => function* () {
                yield* Q.fact(e, { ident });
            }));
        }
        return e;
    }).one();
};
const eidKey = (e) => {
    if (typeof e === "number" && Number.isFinite(e))
        return e;
    if (typeof e === "object" && e !== null && "id" in e) {
        const id = e.id;
        if (typeof id === "number" && Number.isFinite(id))
            return id;
    }
    return Number.NaN;
};
/** Join the three catalog queries into one installed-attribute list. */
export const assembleInstalled = (core, uniques, optionals) => {
    const uniqueByE = new Map();
    for (const row of uniques) {
        const e = eidKey(row.e);
        if (Number.isNaN(e) || typeof row.unique !== "string")
            continue;
        uniqueByE.set(e, row.unique);
    }
    const optionalByE = new Set();
    for (const row of optionals) {
        const e = eidKey(row.e);
        if (Number.isNaN(e))
            continue;
        if (row.optional === true)
            optionalByE.add(e);
    }
    const out = [];
    for (const row of core) {
        if (typeof row.ident !== "string" || isSystemIdent(row.ident))
            continue;
        if (typeof row.valueType !== "string" || typeof row.cardinality !== "string") {
            continue;
        }
        const e = eidKey(row.e);
        const unique = Number.isNaN(e) ? undefined : uniqueByE.get(e);
        const optional = !Number.isNaN(e) && optionalByE.has(e);
        out.push({
            ...(Number.isNaN(e) ? {} : { e }),
            ident: row.ident,
            valueType: row.valueType,
            cardinality: row.cardinality,
            ...(unique === undefined ? {} : { unique }),
            ...(optional ? { optional: true } : {}),
        });
    }
    return out;
};
const desiredOf = (tx) => ({
    ident: tx[":db/ident"],
    valueType: tx[":db/valueType"],
    cardinality: tx[":db/cardinality"],
    ...(tx[":db/unique"] === undefined ? {} : { unique: tx[":db/unique"] }),
    ...(tx[":db/optional"] === true ? { optional: true } : {}),
});
const flip = (ident, kind, from, to) => ({ ident, kind, from, to });
/**
 * Namespaces that already have attributes installed — those are the ones
 * a new required field would land on existing rows of.
 */
export const installedNamespaces = (installed) => {
    const ns = new Set();
    for (const attr of installed) {
        const name = namespaceOf(attr.ident);
        if (name.length > 0)
            ns.add(name);
    }
    return ns;
};
/** Existing idents in `ns`, card-one first so occupancy prefers required keys. */
export const occupancyIdents = (installed, ns) => {
    const attrs = installed.filter((a) => namespaceOf(a.ident) === ns);
    const one = [];
    const many = [];
    for (const a of attrs) {
        (a.cardinality === CARD_MANY ? many : one).push(a.ident);
    }
    return [...one, ...many];
};
const formatChange = (change) => {
    if (change.kind === "required") {
        return `${change.ident} is a new required field on a namespace that already has entities — a default or a migration step is required`;
    }
    const from = change.from ?? "none";
    const to = change.to ?? "none";
    return `${change.ident} ${change.kind} ${from} → ${to}`;
};
export const incompatibleMessage = (changes) => {
    const listed = changes.map((c) => c.ident);
    const hatch = listed.length === 0
        ? ""
        : ` Pass install({ allowIncompatible: [${listed.map((id) => JSON.stringify(id)).join(", ")}] }) to apply them anyway.`;
    return `ramose: install() refused incompatible schema changes: ${changes.map(formatChange).join("; ")}.${hatch}`;
};
/**
 * Diff the desired catalog against the installed attribute set.
 *
 * `occupied` is the set of namespaces that already have at least one
 * entity. A new required field (or an optional→required flip) on an
 * occupied namespace is incompatible.
 */
export const checkEvolution = (desiredTx, installed, occupied, options) => {
    const allowed = new Set(options?.allowIncompatible ?? []);
    const byIdent = new Map(installed.map((a) => [a.ident, a]));
    const changes = [];
    for (const tx of desiredTx) {
        const desired = desiredOf(tx);
        if (allowed.has(desired.ident))
            continue;
        const have = byIdent.get(desired.ident);
        if (have === undefined) {
            if (isRequiredAttr(desired) && occupied.has(namespaceOf(desired.ident))) {
                changes.push({ ident: desired.ident, kind: "required" });
            }
            continue;
        }
        if (have.valueType !== desired.valueType) {
            changes.push(flip(desired.ident, "valueType", have.valueType, desired.valueType));
        }
        if (have.cardinality !== desired.cardinality) {
            changes.push(flip(desired.ident, "cardinality", have.cardinality, desired.cardinality));
        }
        // attributeTx only asserts `:db/unique`; a drop is a documented no-op.
        if (desired.unique !== undefined && have.unique !== desired.unique) {
            changes.push(flip(desired.ident, "unique", have.unique, desired.unique));
        }
        if (!isRequiredAttr(have) && isRequiredAttr(desired) && occupied.has(namespaceOf(desired.ident))) {
            changes.push({ ident: desired.ident, kind: "required" });
        }
    }
    if (changes.length === 0)
        return undefined;
    return new IncompatibleSchema({
        message: incompatibleMessage(changes),
        changes,
    });
};
/**
 * Namespaces that still need an occupancy read: a new required field, or
 * an optional→required flip, not covered by the hatch.
 */
export const namespacesNeedingOccupancy = (desiredTx, installed, options) => {
    const allowed = new Set(options?.allowIncompatible ?? []);
    const byIdent = new Map(installed.map((a) => [a.ident, a]));
    const known = installedNamespaces(installed);
    const needed = new Set();
    for (const tx of desiredTx) {
        const desired = desiredOf(tx);
        if (allowed.has(desired.ident) || !isRequiredAttr(desired))
            continue;
        const ns = namespaceOf(desired.ident);
        if (!known.has(ns))
            continue;
        const have = byIdent.get(desired.ident);
        if (have === undefined || !isRequiredAttr(have))
            needed.add(ns);
    }
    return [...needed];
};
const retractSubject = (have) => have.e !== undefined ? have.e : [":db/ident", have.ident];
/**
 * Retracts for installed-optional / desired-required attrs. `attributeTx`
 * never retracts `:db/optional`; without these ops the flip is a no-op.
 */
export const optionalRetracts = (desiredTx, installed) => {
    const byIdent = new Map(installed.map((a) => [a.ident, a]));
    const out = [];
    for (const tx of desiredTx) {
        const desired = desiredOf(tx);
        const have = byIdent.get(desired.ident);
        if (have === undefined || !isRequiredAttr(desired))
            continue;
        if (have.optional !== true)
            continue;
        out.push([":db/retract", retractSubject(have), ":db/optional", true]);
    }
    return out;
};
/** Catalog upsert plus the retracts that make optional→required real. */
export const installTx = (desiredTx, installed) => [...desiredTx, ...optionalRetracts(desiredTx, installed)];
//# sourceMappingURL=evolution.js.map