/**
 * Transaction processing — pure: (db, txData, t) → datoms.
 *
 * Used both by the in-memory `Connection` (M1) and the Transactor DO (M2);
 * it never touches storage directly, only reads through `Db`.
 *
 * Tx data forms (attribute names are ident strings, e.g. ":user/name"):
 *   [":db/add", e, a, v]
 *   [":db/update", e, a, v]              (never creates; missing subject rejects)
 *   [":db/update", e]                    (existence ping; no write)
 *   [":db/retract", e, a, v?]            (v omitted → retract all values)
 *   [":db/retractEntity", e]             (also retracts refs to e; components recursively)
 *   { ":db/id": e?, ":user/name": "Bob", ":user/friends": [ref, ...], ":user/_friends": [ref] }
 *
 * Entity forms: eid (number) | ident (":..." string) | tempid (other string)
 *   | lookup ref [":attr", value] | nested map (in ref-valued position)
 *   | ":db/tx" (the current transaction entity).
 *
 * Semantics (Datomic-inspired):
 *   - tempids sharing a :db.unique/identity value with an existing entity upsert
 *   - cardinality-one asserts retract the previous value implicitly
 *   - redundant asserts / retracts of absent facts are elided
 *   - :db.unique/value conflicts throw
 */
import { Index, ValueTag, valueKey, } from "./datom.js";
import { Db } from "./db.js";
import { DB_CARDINALITY, DB_IDENT, DB_TX_INSTANT, DB_UNIQUE, DB_VALUE_TYPE, VALUE_TYPE_IDENTS, isTxEid, txEid, } from "./schema.js";
export class TxError extends Error {
    code;
    constructor(msg, code = "tx/invalid") {
        super(msg);
        this.code = code;
    }
}
/** Prefix of tempids generated for map forms without an explicit `:db/id`. */
export const GENERATED_TEMPID_PREFIX = "__ramose.tmp/";
const TX_TEMPID = new Set([":db/tx", "datomic.tx", "db.tx"]);
/**
 * Expand map forms into add ops. Returns the flat op list. Generated tempids
 * are numbered per call, so flattening the same tx data twice yields the same
 * names (the policy pre-check relies on it).
 */
export function flattenTxData(txData) {
    const ops = [];
    let tmpCounter = 0;
    const freshTempid = () => `${GENERATED_TEMPID_PREFIX}${++tmpCounter}`;
    const expandMap = (m) => {
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
                // reverse ref: {:user/_friends [x y]} → x :user/friends e
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
                ops.push({ kind: "add", e, a: k, v, hasV: true });
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
/**
 * Process a transaction against `db`, producing the datoms for tx `t`.
 * `nextEid` is the first free entity id; the returned `nextEid` accounts for
 * allocations. `txInstant` is epoch ms.
 */
export async function processTx(db, txData, t, nextEid, txInstant) {
    const { ops: _ops, newEntities: _ne, ...res } = await expandTx(db, txData, t, nextEid, txInstant);
    return res;
}
/**
 * `processTx` plus the per-datom provenance the policy layer checks against.
 * Same semantics — `processTx` is a projection of this.
 */
export async function expandTx(db, txData, t, nextEid, txInstant, options = {}) {
    const ops = flattenTxData(txData);
    const txe = txEid(t);
    const tempids = new Map();
    const claims = new Map(); // "attr|valueKey" → tempid
    // (a, valueKey) → e for unique attrs asserted in this tx
    const uniqueSeen = new Map();
    const out = [];
    const expanded = [];
    const newEntities = new Set([txe]);
    const closureCap = options.closureCap ?? Number.POSITIVE_INFINITY;
    let closureCount = 0;
    let inRetractEntity = false;
    const record = (kind, e, attr, d, implicit = false) => {
        expanded.push({ kind, e, a: attr.id, attr, datom: d, implicit, fromRetractEntity: inRetractEntity });
        if (inRetractEntity && ++closureCount > closureCap) {
            throw new TxError(`:db/retractEntity closure exceeds ${closureCap} datoms`, "tx/closure-cap");
        }
    };
    // --- Attribute resolution -------------------------------------------------
    const attrOf = (a) => {
        if (a === undefined)
            throw new TxError("missing attribute");
        const at = db.attr(a);
        if (!at)
            throw new TxError(`unknown attribute ${String(a)}`, "tx/unknown-attribute");
        return at;
    };
    // --- Idents created in this tx (so later ops can reference them) ---------
    const newIdents = new Map();
    for (const op of ops) {
        if (op.kind === "add" && op.a === ":db/ident" && typeof op.v === "string")
            newIdents.set(op.v, op.e);
    }
    // --- Entity form → eid ----------------------------------------------------
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
                // The ident's backing entity is a subject of the `:db/ident` add —
                // allocate even when the caller is resolving a ref value.
                if (created !== undefined && created !== form)
                    return resolveEntity(created, true);
                throw new TxError(`unknown ident ${form}`, "tx/unknown-ident");
            }
            // tempid (possibly aliased to another tempid via a shared unique-identity value)
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
            const id = await db.entid(form);
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
    // --- Tempid aliases: two tempids asserting the same unique-identity value are one entity
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
    /** Unique identity asserted earlier in this tx — so `:db/update` lookups see same-tx puts. */
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
    // --- Upsert pass: tempids that assert a unique-identity value already in the db
    for (const op of ops) {
        if (op.kind !== "add" || !isTempid(op.e) || TX_TEMPID.has(op.e))
            continue;
        const attr = attrOf(op.a);
        if (attr.unique !== "identity")
            continue;
        // Only ref-typed attributes can carry tempid / lookup-ref / nested-map values;
        // for scalar types a non-":" string is a plain value, not a tempid.
        if (attr.valueType === ValueTag.Ref && (isTempid(op.v) || isLookupRef(op.v) || isPlainObject(op.v)))
            continue;
        let tv;
        try {
            tv = attr.valueType === ValueTag.Ref && typeof op.v === "string" && op.v[0] === ":"
                ? { vt: ValueTag.Ref, v: db.schema.entid(op.v) }
                : db.coerce(attr, op.v);
        }
        catch {
            continue; // will be reported by the main pass
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
            // unify: both tempids denote the same entity
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
    // --- Within-tx state overlay ---------------------------------------------
    // (e,a) → valueKey → datom (present in the current view + this tx so far)
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
    const emitAdd = async (e, attr, tv) => {
        const vals = await current(e, attr.id);
        const vk = valueKey(tv.vt, tv.v);
        if (vals.has(vk))
            return; // redundant
        if (attr.unique) {
            const uk = attr.id + "|" + vk;
            const seen = uniqueSeen.get(uk);
            if (seen !== undefined && seen !== e) {
                throw new TxError(`unique conflict: ${attr.ident} ${String(tv.v)} already asserted for ${seen}`, "tx/unique-conflict");
            }
            const other = await db.first(Index.AVET, { a: attr.id, vt: tv.vt, v: tv.v });
            if (other && other.e !== e) {
                // if `other` retracted it earlier in this tx, allow
                const ov = await current(other.e, attr.id);
                if (ov.has(vk)) {
                    throw new TxError(`unique conflict: ${attr.ident} ${String(tv.v)} already belongs to entity ${other.e}`, "tx/unique-conflict");
                }
            }
            uniqueSeen.set(uk, e);
        }
        if (attr.cardinality === "one" && vals.size > 0) {
            for (const [ok, od] of vals) {
                const r = { e, a: attr.id, vt: od.vt, v: od.v, t, op: false };
                out.push(r);
                record("retract", e, attr, r, true);
                vals.delete(ok);
            }
        }
        const d = { e, a: attr.id, vt: tv.vt, v: tv.v, t, op: true };
        out.push(d);
        record("add", e, attr, d);
        vals.set(vk, d);
    };
    const emitRetract = async (e, attr, tv) => {
        const vals = await current(e, attr.id);
        if (tv === undefined) {
            for (const [k, d] of vals) {
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
            return; // absent → elide
        const r = { e, a: attr.id, vt: d.vt, v: d.v, t, op: false };
        out.push(r);
        record("retract", e, attr, r);
        vals.delete(vk);
    };
    const retracted = new Set();
    const retractEntity = async (e) => {
        if (retracted.has(e))
            return;
        retracted.add(e);
        const own = await db.datomsArray(Index.EAVT, { e });
        for (const d of own) {
            const attr = db.attr(d.a);
            await emitRetract(e, attr ?? { id: d.a }, { vt: d.vt, v: d.v });
            if (attr?.isComponent && d.vt === ValueTag.Ref)
                await retractEntity(d.v);
        }
        // incoming refs
        const incoming = await db.datomsArray(Index.VAET, { vt: ValueTag.Ref, v: e });
        for (const d of incoming) {
            const attr = db.attr(d.a);
            if (attr)
                await emitRetract(d.e, attr, { vt: d.vt, v: d.v });
        }
        // refs asserted earlier in this tx pointing at e (overlay) are dropped too
        for (const [k, m] of cur) {
            const [ee, aa] = k.split(":").map(Number);
            const attr = db.attr(aa);
            if (attr && attr.valueType === ValueTag.Ref) {
                for (const [vk, d] of m) {
                    if (d.v === e && d.t === t) {
                        const r = { e: ee, a: aa, vt: d.vt, v: d.v, t, op: false };
                        out.push(r);
                        record("retract", ee, attr, r);
                        m.delete(vk);
                    }
                }
            }
        }
    };
    // Tempid subjects of add/update — a ref may resolve these. A tempid that
    // appears only as a ref value is a dangling mint and is rejected.
    const subjectTempids = new Set();
    for (const op of ops) {
        if (op.kind !== "add" && op.kind !== "update")
            continue;
        if (isTempid(op.e) && !TX_TEMPID.has(op.e)) {
            subjectTempids.add(aliasOf(op.e));
            subjectTempids.add(op.e);
        }
    }
    // --- Value coercion --------------------------------------------------------
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
    // --- Schema-attribute value validation ------------------------------------
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
    };
    const nsOfIdent = (ident) => {
        const slash = ident.indexOf("/", 1);
        return slash > 0 ? ident.slice(1, slash) : "";
    };
    const appNamespacesOf = (idents) => {
        const nss = new Set();
        for (const ident of idents) {
            if (ident.startsWith(":db/"))
                continue;
            const ns = nsOfIdent(ident);
            if (ns.length > 0)
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
    /**
     * `preTx`: only namespaces that existed before this tx. Add/set use that so
     * a same-tx bag can still take a second namespace; put onto a pre-existing
     * other-namespace row is still `tx/wrong-entity`.
     */
    const assertWriteTarget = async (e, attr, preTx) => {
        if (!(await entityPresent(e))) {
            throw new TxError(`entity ${e} does not exist`, "tx/missing-entity");
        }
        const ns = nsOfIdent(attr.ident);
        if (ns.length === 0 || attr.ident.startsWith(":db/"))
            return;
        const existing = preTx
            ? await dbAppNamespaces(e)
            : appNamespacesOf(await presentIdents(e));
        if (existing.size > 0 && !existing.has(ns)) {
            throw new TxError(`entity ${e} is not a ${ns}`, "tx/wrong-entity");
        }
    };
    // --- Main pass ------------------------------------------------------------
    for (const op of ops) {
        if (op.kind === "retractEntity") {
            const e = await resolveEntity(op.e, false);
            if (e === undefined)
                continue; // unresolved tempid → nothing to retract
            inRetractEntity = true;
            try {
                await retractEntity(e);
            }
            finally {
                inRetractEntity = false;
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
            await assertWriteTarget(e, attr, false);
            const tv = await valueFor(attr, op.v, true);
            validateSchemaValue(attr, tv);
            await emitAdd(e, attr, tv);
            continue;
        }
        const attr = attrOf(op.a);
        const e = await resolveEntity(op.e, op.kind === "add");
        if (e === undefined)
            continue;
        if (op.kind === "add") {
            await assertWriteTarget(e, attr, true);
            const tv = await valueFor(attr, op.v, true);
            validateSchemaValue(attr, tv);
            await emitAdd(e, attr, tv);
        }
        else {
            const tv = op.hasV ? await valueFor(attr, op.v) : undefined;
            await emitRetract(e, attr, tv);
        }
    }
    const requiredOfNs = (ns) => db.schema.attributes().filter((a) => a.ident.startsWith(`:${ns}/`) &&
        a.cardinality === "one" &&
        !a.optional);
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
    // First datom in a new app namespace is a creation in that namespace —
    // required fields must be present, including on an existing entity (H1/H2).
    const touched = new Set();
    for (const op of expanded) {
        if (op.kind !== "add" || isTxEid(op.e))
            continue;
        touched.add(op.e);
    }
    for (const e of touched) {
        if (retracted.has(e) || isTxEid(e))
            continue;
        const before = await dbAppNamespaces(e);
        const after = appNamespacesOf(await presentIdents(e));
        const born = new Set();
        for (const ns of after) {
            if (!before.has(ns))
                born.add(ns);
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
    // Tx entity instant (first, so tx datoms sort together nicely).
    out.unshift({ e: txe, a: DB_TX_INSTANT, vt: ValueTag.Inst, v: txInstant, t, op: true });
    const tempidsOut = {};
    for (const [k, v] of tempids)
        tempidsOut[k] = v;
    return { t, txEid: txe, datoms: out, tempids: tempidsOut, nextEid, newEntities, ops: expanded };
}
//# sourceMappingURL=tx.js.map