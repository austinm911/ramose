import { Index, ValueTag, valueKey, } from "./datom.js";
import { Db } from "./db.js";
import { ENGINE_TYPE_ASSERTION, } from "./tx-provenance.js";
import { DB_CARDINALITY, DB_IDENT, DB_TX_INSTANT, DB_UNIQUE, DB_VALUE_TYPE, RAMOSE_TYPE_IDENT, VALUE_TYPE_IDENTS, isTxEid, txEid, } from "./schema.js";
export class TxError extends Error {
    code;
    constructor(msg, code = "tx/invalid") {
        super(msg);
        this.code = code;
    }
}
export const GENERATED_TEMPID_PREFIX = "__ramose.tmp/";
const TX_TEMPID = new Set([":db/tx", "datomic.tx", "db.tx"]);
export function flattenTxData(txData) {
    const ops = [];
    let tmpCounter = 0;
    const freshTempid = () => `${GENERATED_TEMPID_PREFIX}${++tmpCounter}`;
    const expandMap = (m) => {
        const engineTypeAssertion = m[ENGINE_TYPE_ASSERTION] === true;
        let e = m[":db/id"];
        if (e === undefined || e === null)
            e = freshTempid();
        for (const [k, val] of Object.entries(m)) {
            if (k === ":db/id")
                continue;
            if (typeof k !== "string" || k[0] !== ":")
                throw new TxError(`bad attribute key ${k}`);
            const slash = k.lastIndexOf("/");
            const name = slash >= 0 ? k.slice(slash + 1) : k.slice(1);
            if (name.startsWith("_")) {
                const attr = slash >= 0 ? k.slice(0, slash + 1) + name.slice(1) : ":" + name.slice(1);
                const vals = Array.isArray(val) ? val : [val];
                for (const x of vals) {
                    const other = isPlainObject(x) ? expandMap(x) : x;
                    ops.push({ kind: "add", e: other, a: attr, v: e, hasV: true });
                }
                continue;
            }
            const vals = Array.isArray(val) && !isLookupRef(val) ? val : [val];
            for (const x of vals) {
                const v = isPlainObject(x) ? expandMap(x) : x;
                ops.push({
                    kind: "add",
                    e,
                    a: k,
                    v,
                    hasV: true,
                    ...(engineTypeAssertion && k === RAMOSE_TYPE_IDENT
                        ? { engineTypeAssertion: true }
                        : {}),
                });
            }
        }
        return e;
    };
    for (const item of txData) {
        if (Array.isArray(item)) {
            const [op, e, a, v] = item;
            switch (op) {
                case ":db/add":
                    if (item.length !== 4)
                        throw new TxError(":db/add needs [op e a v]");
                    ops.push({ kind: "add", e: e, a: a, v: isPlainObject(v) ? expandMap(v) : v, hasV: true });
                    break;
                case ":db/update":
                    if (item.length === 2) {
                        ops.push({ kind: "update", e: e, hasV: false });
                        break;
                    }
                    if (item.length !== 4)
                        throw new TxError(":db/update needs [op e a v]");
                    {
                        const vals = Array.isArray(v) && !isLookupRef(v) ? v : [v];
                        for (const x of vals) {
                            ops.push({
                                kind: "update",
                                e: e,
                                a: a,
                                v: isPlainObject(x) ? expandMap(x) : x,
                                hasV: true,
                            });
                        }
                    }
                    break;
                case ":db/retract":
                    if (item.length !== 3 && item.length !== 4)
                        throw new TxError(":db/retract needs [op e a v?]");
                    ops.push({ kind: "retract", e: e, a: a, v, hasV: item.length === 4 });
                    break;
                case ":db/retractEntity":
                case ":db.fn/retractEntity":
                    ops.push({ kind: "retractEntity", e: e });
                    break;
                case ":db/cas":
                    if (item.length !== 5)
                        throw new TxError(":db/cas needs [op e a expected replacement]");
                    {
                        const expected = item[3];
                        const replacement = item[4];
                        ops.push({
                            kind: "cas",
                            e: e,
                            a: a,
                            v: isPlainObject(replacement) ? expandMap(replacement) : replacement,
                            expected,
                            hasV: true,
                        });
                    }
                    break;
                default:
                    throw new TxError(`unknown tx op ${String(op)}`);
            }
        }
        else if (isPlainObject(item)) {
            expandMap(item);
        }
        else {
            throw new TxError(`bad tx item ${String(item)}`);
        }
    }
    return ops;
}
function isPlainObject(x) {
    return (typeof x === "object" &&
        x !== null &&
        !Array.isArray(x) &&
        !(x instanceof Date) &&
        !(x instanceof Uint8Array) &&
        !("vt" in x && "v" in x && Object.keys(x).length === 2));
}
function isLookupRef(x) {
    return Array.isArray(x) && x.length === 2 && typeof x[0] === "string" && x[0][0] === ":";
}
function isTempid(x) {
    return typeof x === "string" && x[0] !== ":";
}
export async function processTx(db, txData, t, nextEid, txInstant, options) {
    const { ops: _ops, newEntities: _ne, ...res } = await expandTx(db, txData, t, nextEid, txInstant, options);
    return res;
}
export async function expandTx(db, txData, t, nextEid, txInstant, options = {}) {
    const ops = flattenTxData(txData);
    const txe = txEid(t);
    const tempids = new Map();
    const claims = new Map();
    const uniqueSeen = new Map();
    const out = [];
    const expanded = [];
    const newEntities = new Set([txe]);
    const closureCap = options.closureCap ?? Number.POSITIVE_INFINITY;
    let closureCount = 0;
    let inRetractEntity = false;
    let retractEntityRoot;
    const record = (kind, e, attr, d, implicit = false, engineTypeAssertion = false) => {
        expanded.push({
            kind,
            e,
            a: attr.id,
            attr,
            datom: d,
            implicit,
            fromRetractEntity: inRetractEntity,
            retractEntityRoot: inRetractEntity && e === retractEntityRoot,
            engineTypeAssertion,
        });
        if (inRetractEntity && ++closureCount > closureCap) {
            throw new TxError(`:db/retractEntity closure exceeds ${closureCap} datoms`, "tx/closure-cap");
        }
    };
    const attrOf = (a) => {
        if (a === undefined)
            throw new TxError("missing attribute");
        const at = db.attr(a);
        if (!at)
            throw new TxError(`unknown attribute ${String(a)}`, "tx/unknown-attribute");
        return at;
    };
    const newIdents = new Map();
    for (const op of ops) {
        if (op.kind === "add" && op.a === ":db/ident" && typeof op.v === "string")
            newIdents.set(op.v, op.e);
    }
    const lookupEntid = async (form) => {
        try {
            return await db.entid(form);
        }
        catch (err) {
            if (err instanceof TxError)
                throw err;
            const msg = err instanceof Error ? err.message : String(err);
            const code = /unknown attribute|is not unique|bad entity reference/i.test(msg)
                ? "tx/lookup-ref"
                : "tx/invalid";
            throw new TxError(msg.includes("lookup") ? msg : `lookup ref ${JSON.stringify(form)}: ${msg}`, code);
        }
    };
    const resolveEntity = async (form, allocate) => {
        if (typeof form === "number") {
            if (!Number.isSafeInteger(form) || form < 0)
                throw new TxError(`bad entity id ${form}`);
            return form;
        }
        if (typeof form === "string") {
            if (TX_TEMPID.has(form))
                return txe;
            if (form[0] === ":") {
                const id = db.schema.entid(form);
                if (id !== undefined)
                    return id;
                const created = newIdents.get(form);
                if (created !== undefined && created !== form)
                    return resolveEntity(created, true);
                throw new TxError(`unknown ident ${form}`, "tx/unknown-ident");
            }
            const canonical = aliasOf(form);
            const known = tempids.get(canonical);
            if (known !== undefined) {
                if (canonical !== form)
                    tempids.set(form, known);
                return known;
            }
            if (!allocate)
                return undefined;
            const id = nextEid++;
            newEntities.add(id);
            tempids.set(canonical, id);
            if (canonical !== form)
                tempids.set(form, id);
            return id;
        }
        if (isLookupRef(form)) {
            const id = await lookupEntid(form);
            if (id !== undefined)
                return id;
            const sameTx = resolveLookupInTx(form);
            if (sameTx !== undefined)
                return sameTx;
            throw new TxError(`lookup ref ${JSON.stringify(form)} does not resolve`, "tx/lookup-ref");
        }
        if (form !== null && typeof form === "object" && "vt" in form && form.vt === ValueTag.Ref) {
            return form.v;
        }
        throw new TxError(`bad entity form ${JSON.stringify(form)}`);
    };
    const resolveEntityPreflight = async (form) => {
        if (isLookupRef(form))
            return lookupEntid(form);
        return resolveEntity(form, false);
    };
    const aliases = new Map();
    const aliasOf = (tid) => {
        let cur = tid;
        for (;;) {
            const next = aliases.get(cur);
            if (next === undefined || next === cur)
                return cur;
            cur = next;
        }
    };
    const resolveLookupInTx = (form) => {
        let attr;
        try {
            attr = attrOf(form[0]);
        }
        catch {
            return undefined;
        }
        if (!attr.unique)
            return undefined;
        let tv;
        try {
            tv =
                attr.valueType === ValueTag.Ref && typeof form[1] === "string" && form[1][0] === ":"
                    ? { vt: ValueTag.Ref, v: db.schema.entid(form[1]) }
                    : db.coerce(attr, form[1]);
        }
        catch {
            return undefined;
        }
        if (tv.v === undefined)
            return undefined;
        const uk = attr.id + "|" + valueKey(tv.vt, tv.v);
        const seen = uniqueSeen.get(uk);
        if (seen !== undefined)
            return seen;
        const claimant = claims.get(uk);
        if (claimant === undefined)
            return undefined;
        return tempids.get(aliasOf(claimant));
    };
    for (const op of ops) {
        if (op.kind !== "add" || !isTempid(op.e) || TX_TEMPID.has(op.e))
            continue;
        const attr = attrOf(op.a);
        if (attr.unique !== "identity")
            continue;
        if (attr.valueType === ValueTag.Ref && (isTempid(op.v) || isLookupRef(op.v) || isPlainObject(op.v)))
            continue;
        let tv;
        try {
            tv = attr.valueType === ValueTag.Ref && typeof op.v === "string" && op.v[0] === ":"
                ? { vt: ValueTag.Ref, v: db.schema.entid(op.v) }
                : db.coerce(attr, op.v);
        }
        catch {
            continue;
        }
        if (tv.v === undefined)
            continue;
        const claimKey = attr.id + "|" + valueKey(tv.vt, tv.v);
        const existing = await db.first(Index.AVET, { a: attr.id, vt: tv.vt, v: tv.v });
        const canonical = aliasOf(op.e);
        if (existing) {
            const prev = tempids.get(canonical);
            if (prev !== undefined && prev !== existing.e) {
                throw new TxError(`tempid ${op.e} resolves to two entities (${prev}, ${existing.e})`, "tx/unique-conflict");
            }
            tempids.set(canonical, existing.e);
        }
        const claimant = claims.get(claimKey);
        if (claimant === undefined)
            claims.set(claimKey, canonical);
        else if (aliasOf(claimant) !== canonical) {
            const target = aliasOf(claimant);
            const a = tempids.get(canonical), b = tempids.get(target);
            if (a !== undefined && b !== undefined && a !== b) {
                throw new TxError(`tempids ${op.e} and ${claimant} resolve to different entities`, "tx/unique-conflict");
            }
            aliases.set(canonical, target);
            if (a !== undefined && b === undefined)
                tempids.set(target, a);
        }
    }
    const cur = new Map();
    const current = async (e, a) => {
        const k = e + ":" + a;
        let m = cur.get(k);
        if (m)
            return m;
        m = new Map();
        for (const d of await db.datomsArray(Index.EAVT, { e, a }))
            m.set(valueKey(d.vt, d.v), d);
        cur.set(k, m);
        return m;
    };
    const casFacts = new Set();
    const casFactKey = (e, a, vt, v) => e + ":" + a + ":" + valueKey(vt, v);
    const rejectIfCasFact = (e, a, vt, v) => {
        if (casFacts.has(casFactKey(e, a, vt, v))) {
            throw new TxError("cannot retract a :db/cas assertion in the same transaction");
        }
    };
    const emitAdd = async (e, attr, tv, engineTypeAssertion = false) => {
        const vals = await current(e, attr.id);
        const vk = valueKey(tv.vt, tv.v);
        if (vals.has(vk)) {
            if (attr.ident === RAMOSE_TYPE_IDENT) {
                record("add", e, attr, { e, a: attr.id, vt: tv.vt, v: tv.v, t, op: true }, false, engineTypeAssertion);
            }
            return;
        }
        if (attr.unique) {
            const uk = attr.id + "|" + vk;
            const seen = uniqueSeen.get(uk);
            if (seen !== undefined && seen !== e) {
                throw new TxError(`unique conflict: ${attr.ident} ${String(tv.v)} already asserted for ${seen}`, "tx/unique-conflict");
            }
            const other = await db.first(Index.AVET, { a: attr.id, vt: tv.vt, v: tv.v });
            if (other && other.e !== e) {
                const ov = await current(other.e, attr.id);
                if (ov.has(vk)) {
                    throw new TxError(`unique conflict: ${attr.ident} ${String(tv.v)} already belongs to entity ${other.e}`, "tx/unique-conflict");
                }
            }
            uniqueSeen.set(uk, e);
        }
        if (attr.cardinality === "one" && vals.size > 0) {
            for (const [ok, od] of vals) {
                rejectIfCasFact(e, attr.id, od.vt, od.v);
                const r = { e, a: attr.id, vt: od.vt, v: od.v, t, op: false };
                out.push(r);
                record("retract", e, attr, r, true);
                vals.delete(ok);
            }
        }
        const d = { e, a: attr.id, vt: tv.vt, v: tv.v, t, op: true };
        out.push(d);
        record("add", e, attr, d, false, engineTypeAssertion);
        vals.set(vk, d);
    };
    const emitRetract = async (e, attr, tv) => {
        const vals = await current(e, attr.id);
        if (tv === undefined) {
            for (const [k, d] of vals) {
                rejectIfCasFact(e, attr.id, d.vt, d.v);
                const r = { e, a: attr.id, vt: d.vt, v: d.v, t, op: false };
                out.push(r);
                record("retract", e, attr, r);
                vals.delete(k);
            }
            return;
        }
        const vk = valueKey(tv.vt, tv.v);
        const d = vals.get(vk);
        if (!d)
            return;
        rejectIfCasFact(e, attr.id, tv.vt, tv.v);
        const r = { e, a: attr.id, vt: d.vt, v: d.v, t, op: false };
        out.push(r);
        record("retract", e, attr, r);
        vals.delete(vk);
    };
    const casReplacementEids = new Set();
    const casReplacementTempids = new Set();
    const isCasReplacementEid = (e) => {
        if (casReplacementEids.has(e))
            return true;
        for (const tid of casReplacementTempids) {
            if (tempids.get(aliasOf(tid)) === e)
                return true;
        }
        return false;
    };
    const retracted = new Set();
    const retractEntity = async (e) => {
        if (retracted.has(e))
            return;
        if (isCasReplacementEid(e)) {
            throw new TxError("cannot :db/retractEntity a :db/cas replacement in the same transaction");
        }
        retracted.add(e);
        const own = await db.datomsArray(Index.EAVT, { e });
        for (const d of own) {
            const attr = db.attr(d.a);
            await emitRetract(e, attr ?? { id: d.a }, { vt: d.vt, v: d.v });
            if (attr?.isComponent && d.vt === ValueTag.Ref)
                await retractEntity(d.v);
        }
        const incoming = await db.datomsArray(Index.VAET, { vt: ValueTag.Ref, v: e });
        for (const d of incoming) {
            const attr = db.attr(d.a);
            if (attr)
                await emitRetract(d.e, attr, { vt: d.vt, v: d.v });
        }
        for (const [k, m] of cur) {
            const [ee, aa] = k.split(":").map(Number);
            const attr = db.attr(aa);
            if (attr && attr.valueType === ValueTag.Ref) {
                for (const [, d] of [...m]) {
                    if (d.v === e && d.t === t) {
                        await emitRetract(ee, attr, { vt: d.vt, v: d.v });
                    }
                }
            }
        }
    };
    const subjectTempids = new Set();
    for (const op of ops) {
        if (op.kind !== "add" && op.kind !== "update")
            continue;
        if (isTempid(op.e) && !TX_TEMPID.has(op.e)) {
            subjectTempids.add(aliasOf(op.e));
            subjectTempids.add(op.e);
        }
    }
    const valueFor = async (attr, v, bindRef = false) => {
        if (v === undefined || v === null)
            throw new TxError(`nil value for ${attr.ident}`);
        if (attr.valueType === ValueTag.Ref) {
            if (typeof v === "number") {
                if (!Number.isSafeInteger(v) || v < 0)
                    throw new TxError(`bad entity id ${v}`);
                if (bindRef && !(await entityPresent(v))) {
                    throw new TxError(`entity ${v} does not exist`, "tx/missing-entity");
                }
                return { vt: ValueTag.Ref, v };
            }
            const allocate = bindRef && isTempid(v) && subjectTempids.has(aliasOf(v));
            const id = await resolveEntity(v, allocate);
            if (id === undefined) {
                throw new TxError(`cannot resolve ref value ${JSON.stringify(v)} for ${attr.ident}`, "tx/missing-entity");
            }
            if (bindRef && !(await entityPresent(id))) {
                throw new TxError(`entity ${id} does not exist`, "tx/missing-entity");
            }
            return { vt: ValueTag.Ref, v: id };
        }
        try {
            return db.coerce(attr, v);
        }
        catch (err) {
            throw new TxError(`${attr.ident}: ${err.message}`, "tx/type-mismatch");
        }
    };
    const validateSchemaValue = (attr, tv) => {
        if (attr.id === DB_VALUE_TYPE && !(String(tv.v) in VALUE_TYPE_IDENTS)) {
            throw new TxError(`invalid :db/valueType ${String(tv.v)}`, "tx/schema");
        }
        if (attr.id === DB_CARDINALITY && tv.v !== ":db.cardinality/one" && tv.v !== ":db.cardinality/many") {
            throw new TxError(`invalid :db/cardinality ${String(tv.v)}`, "tx/schema");
        }
        if (attr.id === DB_UNIQUE && tv.v !== ":db.unique/identity" && tv.v !== ":db.unique/value") {
            throw new TxError(`invalid :db/unique ${String(tv.v)}`, "tx/schema");
        }
        if (attr.id === DB_IDENT && (typeof tv.v !== "string" || tv.v[0] !== ":")) {
            throw new TxError(`:db/ident must be a keyword-like string starting with ':'`, "tx/schema");
        }
        if (attr.ident === RAMOSE_TYPE_IDENT && (typeof tv.v !== "string" || tv.v[0] !== ":")) {
            throw new TxError(`${attr.ident} must be a keyword-like string starting with ':'`, "tx/schema");
        }
    };
    const nsOfIdent = (ident) => {
        const slash = ident.indexOf("/", 1);
        return slash > 0 ? ident.slice(1, slash) : "";
    };
    const nsOfComposer = (ident) => {
        const ns = nsOfIdent(ident);
        if (ns.length > 0)
            return ns;
        return ident.startsWith(":") ? ident.slice(1) : ident;
    };
    const composition = options.composition;
    const isEntityIdent = (ident) => composition !== undefined && composition.isEntityIdent(ident);
    const isTraitIdent = (ident) => composition !== undefined && composition.isTraitIdent(ident);
    const transitiveTraits = (ident) => composition?.transitiveTraits(ident) ?? [];
    const isCanonicalTypeIdent = (value) => typeof value === "string" &&
        value.startsWith(":") &&
        value.length > 1 &&
        !value.slice(1).includes("/");
    const isSystemIdent = (ident) => ident.startsWith(":db/") || ident.startsWith(":ramose/");
    const isMembershipIdent = (ident) => ident === RAMOSE_TYPE_IDENT;
    const appNamespacesOf = (idents) => {
        const nss = new Set();
        for (const ident of idents) {
            if (isSystemIdent(ident))
                continue;
            const ns = nsOfIdent(ident);
            if (ns.length === 0)
                continue;
            if (isTraitIdent(`:${ns}`))
                continue;
            nss.add(ns);
        }
        return nss;
    };
    const presentIdents = async (e) => {
        const idents = [];
        const seen = new Set();
        const add = (ident) => {
            if (ident === undefined || seen.has(ident))
                return;
            seen.add(ident);
            idents.push(ident);
        };
        for (const [k, m] of cur) {
            if (!k.startsWith(e + ":") || m.size === 0)
                continue;
            const a = Number(k.slice(String(e).length + 1));
            add(db.attr(a)?.ident);
        }
        if ((await db.exists(e)) && !retracted.has(e)) {
            const row = await db.entity(e);
            if (row !== undefined) {
                for (const key of Object.keys(row)) {
                    if (key !== ":db/id")
                        add(key);
                }
            }
        }
        return idents;
    };
    const entityPresent = async (e) => {
        if (retracted.has(e))
            return false;
        if (newEntities.has(e))
            return true;
        for (const [k, m] of cur) {
            if (k.startsWith(e + ":") && m.size > 0)
                return true;
        }
        return db.exists(e);
    };
    const dbAppNamespaces = async (e) => {
        if (!(await db.exists(e)) || retracted.has(e))
            return new Set();
        const row = await db.entity(e);
        if (row === undefined)
            return new Set();
        return appNamespacesOf(Object.keys(row).filter((k) => k !== ":db/id"));
    };
    const typeAttr = () => db.attr(RAMOSE_TYPE_IDENT);
    const readType = async (e) => {
        const attr = typeAttr();
        if (attr === undefined)
            return undefined;
        const vals = await current(e, attr.id);
        if (vals.size === 0)
            return undefined;
        const first = vals.values().next().value;
        return typeof first?.v === "string" ? first.v : undefined;
    };
    const assertWriteTarget = async (e, attr, preTx) => {
        if (!(await entityPresent(e))) {
            throw new TxError(`entity ${e} does not exist`, "tx/missing-entity");
        }
        const ns = nsOfIdent(attr.ident);
        if (ns.length === 0 || isSystemIdent(attr.ident))
            return;
        const existing = preTx
            ? await dbAppNamespaces(e)
            : appNamespacesOf(await presentIdents(e));
        if (existing.size === 0)
            return;
        if (existing.has(ns))
            return;
        const allowed = new Set(existing);
        for (const entityNs of existing) {
            for (const trait of transitiveTraits(`:${entityNs}`)) {
                allowed.add(nsOfComposer(trait));
            }
        }
        const typeIdent = await readType(e);
        if (typeIdent !== undefined) {
            allowed.add(nsOfComposer(typeIdent));
            for (const trait of transitiveTraits(typeIdent)) {
                allowed.add(nsOfComposer(trait));
            }
        }
        if (!allowed.has(ns)) {
            throw new TxError(`entity ${e} is not a ${ns}`, "tx/wrong-entity");
        }
    };
    const resolveCasSubject = async (form) => {
        if (typeof form === "string" && (TX_TEMPID.has(form) || isTempid(form))) {
            throw new TxError(":db/cas subject must be an existing eid or lookup ref");
        }
        if (isLookupRef(form)) {
            const id = await lookupEntid(form);
            if (id === undefined) {
                throw new TxError(`lookup ref ${JSON.stringify(form)} does not resolve`, "tx/lookup-ref");
            }
            return id;
        }
        const e = await resolveEntity(form, false);
        if (e === undefined) {
            throw new TxError(":db/cas subject must be an existing eid or lookup ref");
        }
        if (!(await db.exists(e))) {
            throw new TxError(`entity ${e} does not exist`, "tx/missing-entity");
        }
        return e;
    };
    const rememberCasReplacement = async (v) => {
        if (v === undefined || v === null)
            return;
        if (isTempid(v) && !TX_TEMPID.has(v)) {
            casReplacementTempids.add(v);
            casReplacementTempids.add(aliasOf(v));
            const known = tempids.get(aliasOf(v));
            if (known !== undefined)
                casReplacementEids.add(known);
            return;
        }
        if (typeof v === "number") {
            if (!Number.isSafeInteger(v) || v < 0)
                throw new TxError(`bad entity id ${v}`);
            casReplacementEids.add(v);
            return;
        }
        if (typeof v === "string" && v[0] === ":") {
            const id = db.schema.entid(v);
            if (id !== undefined)
                casReplacementEids.add(id);
            return;
        }
        if (isLookupRef(v)) {
            const id = await lookupEntid(v);
            if (id !== undefined)
                casReplacementEids.add(id);
            return;
        }
        if (v !== null && typeof v === "object" && "vt" in v && v.vt === ValueTag.Ref) {
            casReplacementEids.add(v.v);
        }
    };
    const casPairs = new Set();
    const casSubjects = new Set();
    const pairKey = (e, a) => e + ":" + a;
    const rejectIfCasPair = (kind, e, attr) => {
        if (casPairs.has(pairKey(e, attr.id))) {
            throw new TxError(`cannot ${kind} the same (${e}, ${attr.ident}) as a :db/cas in the same transaction`);
        }
    };
    for (const op of ops) {
        if (op.kind !== "cas")
            continue;
        const attr = attrOf(op.a);
        const e = await resolveCasSubject(op.e);
        const k = pairKey(e, attr.id);
        if (casPairs.has(k)) {
            throw new TxError(`:db/cas may mutate (${e}, ${attr.ident}) at most once in a transaction`);
        }
        casPairs.add(k);
        casSubjects.add(e);
        if (attr.valueType === ValueTag.Ref)
            await rememberCasReplacement(op.v);
    }
    if (casPairs.size > 0) {
        for (const op of ops) {
            if (op.kind === "cas")
                continue;
            if (op.kind === "retractEntity") {
                if (isTempid(op.e) && !TX_TEMPID.has(op.e) && casReplacementTempids.has(aliasOf(op.e))) {
                    throw new TxError("cannot :db/retractEntity a :db/cas replacement in the same transaction");
                }
                const e = await resolveEntityPreflight(op.e);
                if (e !== undefined && casSubjects.has(e)) {
                    throw new TxError("cannot :db/retractEntity a :db/cas subject in the same transaction");
                }
                if (e !== undefined && casReplacementEids.has(e)) {
                    throw new TxError("cannot :db/retractEntity a :db/cas replacement in the same transaction");
                }
                continue;
            }
            if (op.a === undefined)
                continue;
            const attr = attrOf(op.a);
            const e = await resolveEntityPreflight(op.e);
            if (e === undefined)
                continue;
            rejectIfCasPair(op.kind, e, attr);
        }
    }
    for (const op of ops) {
        if (op.kind === "retractEntity") {
            const e = await resolveEntity(op.e, false);
            if (e === undefined)
                continue;
            inRetractEntity = true;
            retractEntityRoot = e;
            try {
                await retractEntity(e);
            }
            finally {
                inRetractEntity = false;
                retractEntityRoot = undefined;
            }
            continue;
        }
        if (op.kind === "update") {
            let e;
            try {
                e = await resolveEntity(op.e, false);
            }
            catch (err) {
                if (err instanceof TxError && err.code === "tx/lookup-ref") {
                    throw new TxError(err.message, "tx/missing-entity");
                }
                throw err;
            }
            if (e === undefined) {
                throw new TxError(`entity ${JSON.stringify(op.e)} does not exist`, "tx/missing-entity");
            }
            if (typeof op.e === "number" && !(await entityPresent(e))) {
                throw new TxError(`entity ${e} does not exist`, "tx/missing-entity");
            }
            if (op.a === undefined || op.hasV === false) {
                if (!(await entityPresent(e))) {
                    throw new TxError(`entity ${e} does not exist`, "tx/missing-entity");
                }
                continue;
            }
            const attr = attrOf(op.a);
            rejectIfCasPair(op.kind, e, attr);
            await assertWriteTarget(e, attr, false);
            const tv = await valueFor(attr, op.v, true);
            validateSchemaValue(attr, tv);
            await emitAdd(e, attr, tv);
            continue;
        }
        if (op.kind === "cas") {
            if (op.expected === undefined) {
                throw new TxError(":db/cas expected must be a value or null (undefined is not the absent encoding)");
            }
            const attr = attrOf(op.a);
            const e = await resolveCasSubject(op.e);
            if (attr.cardinality !== "one") {
                throw new TxError(`:db/cas is cardinality-one only (${attr.ident})`);
            }
            await assertWriteTarget(e, attr, true);
            const replacementTv = await valueFor(attr, op.v, true);
            validateSchemaValue(attr, replacementTv);
            const before = new Map();
            for (const d of await db.datomsArray(Index.EAVT, { e, a: attr.id })) {
                before.set(valueKey(d.vt, d.v), d);
            }
            let expectedLabel = "absent";
            let match = false;
            if (op.expected === null) {
                match = before.size === 0;
            }
            else {
                const expectedTv = await valueFor(attr, op.expected, false);
                expectedLabel = String(expectedTv.v);
                match = before.size === 1 && before.has(valueKey(expectedTv.vt, expectedTv.v));
            }
            if (!match) {
                const found = before.size === 0
                    ? "absent"
                    : before.size > 1
                        ? "multiple values"
                        : String(before.values().next().value.v);
                throw new TxError(`CAS conflict on ${attr.ident}: expected ${expectedLabel}, found ${found}`, "tx/cas-conflict");
            }
            await emitAdd(e, attr, replacementTv);
            casFacts.add(casFactKey(e, attr.id, replacementTv.vt, replacementTv.v));
            if (attr.valueType === ValueTag.Ref) {
                casReplacementEids.add(replacementTv.v);
            }
            continue;
        }
        const attr = attrOf(op.a);
        const e = await resolveEntity(op.e, op.kind === "add");
        if (e === undefined)
            continue;
        rejectIfCasPair(op.kind, e, attr);
        if (op.kind === "add") {
            await assertWriteTarget(e, attr, true);
            const tv = await valueFor(attr, op.v, true);
            validateSchemaValue(attr, tv);
            await emitAdd(e, attr, tv, op.engineTypeAssertion === true);
        }
        else {
            const tv = op.hasV ? await valueFor(attr, op.v) : undefined;
            await emitRetract(e, attr, tv);
        }
    }
    const requiredOfNs = (ns) => db.schema.attributes().filter((a) => a.ident.startsWith(`:${ns}/`) &&
        a.cardinality === "one" &&
        !a.optional);
    const requiredOfType = (typeIdent) => {
        const nss = [
            nsOfComposer(typeIdent),
            ...transitiveTraits(typeIdent).map(nsOfComposer),
        ];
        const out = [];
        const seen = new Set();
        for (const ns of nss) {
            if (ns.length === 0)
                continue;
            for (const attr of requiredOfNs(ns)) {
                if (seen.has(attr.ident))
                    continue;
                seen.add(attr.ident);
                out.push(attr);
            }
        }
        return out;
    };
    const missingRequired = async (e, nss) => {
        const missing = [];
        for (const ns of nss) {
            for (const attr of requiredOfNs(ns)) {
                const vals = await current(e, attr.id);
                if (vals.size === 0)
                    missing.push(attr.ident);
            }
        }
        return missing;
    };
    const missingRequiredAttrs = async (e, attrs) => {
        const missing = [];
        for (const attr of attrs) {
            const vals = await current(e, attr.id);
            if (vals.size === 0)
                missing.push(attr.ident);
        }
        return missing;
    };
    const inferType = async (e) => {
        const nss = appNamespacesOf(await presentIdents(e));
        const entityNss = composition === undefined
            ? [...nss]
            : [...nss].filter((ns) => isEntityIdent(`:${ns}`));
        if (entityNss.length > 1) {
            throw new TxError(`cannot create an entity in multiple composed types: ${[...entityNss]
                .sort()
                .map((n) => `:${n}`)
                .join(", ")}`, "tx/wrong-entity");
        }
        const asserted = await readType(e);
        if (asserted !== undefined) {
            if (composition !== undefined && !isEntityIdent(asserted)) {
                throw new TxError(`unknown entity type ${asserted}`, "tx/wrong-entity");
            }
            return asserted;
        }
        if (entityNss.length === 1)
            return `:${entityNss[0]}`;
        return undefined;
    };
    const touched = new Set();
    for (const op of expanded) {
        if (op.kind !== "add" || isTxEid(op.e))
            continue;
        touched.add(op.e);
    }
    for (const op of expanded) {
        if (!isMembershipIdent(op.attr.ident))
            continue;
        if (op.fromRetractEntity)
            continue;
        const typeBefore = op.kind === "add" && op.attr.ident === RAMOSE_TYPE_IDENT
            ? await (async () => {
                const row = await db.entity(op.e);
                const value = row?.[RAMOSE_TYPE_IDENT];
                return typeof value === "string" ? value : undefined;
            })()
            : undefined;
        if (op.kind === "add" &&
            op.attr.ident === RAMOSE_TYPE_IDENT &&
            op.engineTypeAssertion &&
            isCanonicalTypeIdent(op.datom.v) &&
            (newEntities.has(op.e) || typeBefore === op.datom.v) &&
            (composition === undefined || isEntityIdent(op.datom.v))) {
            continue;
        }
        throw new TxError(op.kind === "retract"
            ? `cannot retract system fact ${op.attr.ident}`
            : `cannot write system fact ${op.attr.ident}`, "tx/system");
    }
    for (const e of touched) {
        if (retracted.has(e) || isTxEid(e))
            continue;
        const typeBefore = await (async () => {
            if (!(await db.exists(e)) || retracted.has(e))
                return undefined;
            const attr = typeAttr();
            if (attr === undefined)
                return undefined;
            const row = await db.entity(e);
            const v = row?.[RAMOSE_TYPE_IDENT];
            return typeof v === "string" ? v : undefined;
        })();
        const type = await inferType(e);
        const traitNss = new Set();
        for (const ident of await presentIdents(e)) {
            if (isSystemIdent(ident))
                continue;
            const ns = nsOfIdent(ident);
            if (ns.length > 0 && isTraitIdent(`:${ns}`))
                traitNss.add(ns);
        }
        if (type === undefined && typeBefore === undefined) {
            if (traitNss.size > 0) {
                throw new TxError(`cannot create an entity from trait attributes alone: ${[...traitNss]
                    .sort()
                    .map((n) => `:${n}`)
                    .join(", ")}`, "tx/wrong-entity");
            }
        }
        else if (type !== undefined) {
            const allowed = new Set(transitiveTraits(type).map(nsOfComposer));
            for (const ns of [...traitNss].sort()) {
                if (!allowed.has(ns)) {
                    throw new TxError(`entity ${e} is not a ${ns}`, "tx/wrong-entity");
                }
            }
        }
        if (typeBefore !== undefined) {
            const typeAfter = await readType(e);
            if (typeAfter !== undefined && typeAfter !== typeBefore) {
                throw new TxError(`cannot change system fact ${RAMOSE_TYPE_IDENT}`, "tx/system");
            }
        }
        else if (type !== undefined && (composition === undefined || isEntityIdent(type))) {
            const ta = typeAttr();
            if (ta !== undefined) {
                await emitAdd(e, ta, { vt: ValueTag.Str, v: type });
            }
        }
        const before = await dbAppNamespaces(e);
        const after = appNamespacesOf(await presentIdents(e));
        const born = new Set();
        for (const ns of after) {
            if (!before.has(ns))
                born.add(ns);
        }
        const typeIsNew = type !== undefined && typeBefore === undefined;
        if (typeIsNew && (composition === undefined || isEntityIdent(type))) {
            const missing = await missingRequiredAttrs(e, requiredOfType(type));
            if (missing.length > 0) {
                throw new TxError(`entity ${nsOfComposer(type)} is missing required fields: ${missing.join(", ")}`, "tx/required");
            }
        }
        if (born.size === 0)
            continue;
        const missing = await missingRequired(e, born);
        if (missing.length > 0) {
            const entity = [...born][0] ?? "entity";
            throw new TxError(`entity ${entity} is missing required fields: ${missing.join(", ")}`, "tx/required");
        }
    }
    for (const op of expanded) {
        if (op.kind !== "retract" || op.implicit)
            continue;
        if (op.attr.cardinality !== "one" || op.attr.optional)
            continue;
        if (op.attr.ident.startsWith(":db/"))
            continue;
        if (retracted.has(op.e) || isTxEid(op.e))
            continue;
        const vals = await current(op.e, op.attr.id);
        if (vals.size > 0)
            continue;
        const nss = appNamespacesOf(await presentIdents(op.e));
        if (nss.size === 0)
            continue;
        throw new TxError(op.fromRetractEntity
            ? `entity ${op.e} still references the deleted entity via required ${op.attr.ident} — delete or re-point it first`
            : `cannot clear required field ${op.attr.ident}`, "tx/required");
    }
    out.unshift({ e: txe, a: DB_TX_INSTANT, vt: ValueTag.Inst, v: txInstant, t, op: true });
    const tempidsOut = {};
    for (const [k, v] of tempids)
        tempidsOut[k] = v;
    return { t, txEid: txe, datoms: out, tempids: tempidsOut, nextEid, newEntities, ops: expanded };
}
//# sourceMappingURL=tx.js.map