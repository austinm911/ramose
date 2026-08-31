import { ValueTag } from "./datom.js";
export const DB_IDENT = 10;
export const DB_VALUE_TYPE = 40;
export const DB_CARDINALITY = 41;
export const DB_UNIQUE = 42;
export const DB_IS_COMPONENT = 43;
export const DB_INDEX = 44;
export const DB_OPTIONAL = 45;
export const RAMOSE_TYPE = 46;
export const DB_TX_INSTANT = 50;
export const DB_DOC = 62;
export const RAMOSE_TYPE_IDENT = ":ramose/type";
export const FIRST_USER_EID = 1000;
export const TX_BASE = 2 ** 42;
export function txEid(t) {
    return TX_BASE + t;
}
export function isTxEid(e) {
    return e >= TX_BASE;
}
export function tOfTxEid(e) {
    return e - TX_BASE;
}
export const VALUE_TYPE_IDENTS = {
    ":db.type/long": ValueTag.Long,
    ":db.type/double": ValueTag.Double,
    ":db.type/string": ValueTag.Str,
    ":db.type/boolean": ValueTag.Bool,
    ":db.type/ref": ValueTag.Ref,
    ":db.type/uuid": ValueTag.Uuid,
    ":db.type/instant": ValueTag.Inst,
    ":db.type/bytes": ValueTag.Bytes,
};
export const VALUE_TYPE_NAMES = Object.fromEntries(Object.entries(VALUE_TYPE_IDENTS).map(([k, v]) => [v, k]));
const BOOTSTRAP_SPECS = [
    { id: DB_IDENT, ident: ":db/ident", valueType: ":db.type/string", cardinality: "one", unique: "identity", doc: "Unique name of an entity" },
    { id: DB_VALUE_TYPE, ident: ":db/valueType", valueType: ":db.type/string", cardinality: "one" },
    { id: DB_CARDINALITY, ident: ":db/cardinality", valueType: ":db.type/string", cardinality: "one" },
    { id: DB_UNIQUE, ident: ":db/unique", valueType: ":db.type/string", cardinality: "one" },
    { id: DB_IS_COMPONENT, ident: ":db/isComponent", valueType: ":db.type/boolean", cardinality: "one" },
    { id: DB_INDEX, ident: ":db/index", valueType: ":db.type/boolean", cardinality: "one" },
    { id: DB_OPTIONAL, ident: ":db/optional", valueType: ":db.type/boolean", cardinality: "one" },
    { id: RAMOSE_TYPE, ident: RAMOSE_TYPE_IDENT, valueType: ":db.type/string", cardinality: "one", index: true, doc: "Concrete entity type membership" },
    { id: DB_TX_INSTANT, ident: ":db/txInstant", valueType: ":db.type/instant", cardinality: "one", index: true },
    { id: DB_DOC, ident: ":db/doc", valueType: ":db.type/string", cardinality: "one" },
];
export function attributeDatoms(e, spec, t) {
    const vt = typeof spec.valueType === "number" ? spec.valueType : VALUE_TYPE_IDENTS[spec.valueType];
    if (vt === undefined)
        throw new Error(`unknown valueType ${String(spec.valueType)}`);
    const out = [
        { e, a: DB_IDENT, vt: ValueTag.Str, v: spec.ident, t, op: true },
        { e, a: DB_VALUE_TYPE, vt: ValueTag.Str, v: VALUE_TYPE_NAMES[vt], t, op: true },
        { e, a: DB_CARDINALITY, vt: ValueTag.Str, v: `:db.cardinality/${spec.cardinality ?? "one"}`, t, op: true },
    ];
    if (spec.unique)
        out.push({ e, a: DB_UNIQUE, vt: ValueTag.Str, v: `:db.unique/${spec.unique}`, t, op: true });
    if (spec.index)
        out.push({ e, a: DB_INDEX, vt: ValueTag.Bool, v: true, t, op: true });
    if (spec.isComponent)
        out.push({ e, a: DB_IS_COMPONENT, vt: ValueTag.Bool, v: true, t, op: true });
    if (spec.optional)
        out.push({ e, a: DB_OPTIONAL, vt: ValueTag.Bool, v: true, t, op: true });
    if (spec.doc)
        out.push({ e, a: DB_DOC, vt: ValueTag.Str, v: spec.doc, t, op: true });
    return out;
}
export function bootstrapDatoms() {
    const t = 1;
    const out = [];
    for (const s of BOOTSTRAP_SPECS)
        out.push(...attributeDatoms(s.id, s, t));
    out.push({ e: txEid(t), a: DB_TX_INSTANT, vt: ValueTag.Inst, v: 0, t, op: true });
    return out;
}
export class Schema {
    byId = new Map();
    byIdent = new Map();
    idents = new Map();
    identOf = new Map();
    partials = new Map();
    static bootstrap() {
        return new Schema().apply(bootstrapDatoms());
    }
    clone() {
        const s = new Schema();
        for (const [k, v] of this.byId)
            s.byId.set(k, v);
        for (const [k, v] of this.byIdent)
            s.byIdent.set(k, v);
        for (const [k, v] of this.idents)
            s.idents.set(k, v);
        for (const [k, v] of this.identOf)
            s.identOf.set(k, v);
        for (const [k, v] of this.partials)
            s.partials.set(k, { ...v });
        return s;
    }
    apply(datoms) {
        const touched = new Set();
        for (const d of datoms) {
            if (d.a > DB_DOC)
                continue;
            let p = this.partials.get(d.e);
            switch (d.a) {
                case DB_IDENT: {
                    if (!p)
                        this.partials.set(d.e, (p = {}));
                    if (d.op) {
                        p.ident = d.v;
                        this.idents.set(d.v, d.e);
                        this.identOf.set(d.e, d.v);
                    }
                    else {
                        if (this.idents.get(d.v) === d.e)
                            this.idents.delete(d.v);
                        this.identOf.delete(d.e);
                        if (p.ident === d.v)
                            p.ident = undefined;
                    }
                    touched.add(d.e);
                    break;
                }
                case DB_VALUE_TYPE:
                    if (!p)
                        this.partials.set(d.e, (p = {}));
                    p.valueType = d.op ? d.v : undefined;
                    touched.add(d.e);
                    break;
                case DB_CARDINALITY:
                    if (!p)
                        this.partials.set(d.e, (p = {}));
                    p.cardinality = d.op ? d.v : undefined;
                    touched.add(d.e);
                    break;
                case DB_UNIQUE:
                    if (!p)
                        this.partials.set(d.e, (p = {}));
                    p.unique = d.op ? d.v : undefined;
                    touched.add(d.e);
                    break;
                case DB_INDEX:
                    if (!p)
                        this.partials.set(d.e, (p = {}));
                    p.index = d.op ? d.v : undefined;
                    touched.add(d.e);
                    break;
                case DB_OPTIONAL:
                    if (!p)
                        this.partials.set(d.e, (p = {}));
                    p.optional = d.op ? d.v : undefined;
                    touched.add(d.e);
                    break;
                case DB_IS_COMPONENT:
                    if (!p)
                        this.partials.set(d.e, (p = {}));
                    p.isComponent = d.op ? d.v : undefined;
                    touched.add(d.e);
                    break;
                case DB_DOC:
                    if (!p)
                        this.partials.set(d.e, (p = {}));
                    p.doc = d.op ? d.v : undefined;
                    touched.add(d.e);
                    break;
                default:
                    break;
            }
        }
        for (const e of touched)
            this.rebuild(e);
        return this;
    }
    rebuild(e) {
        const p = this.partials.get(e);
        const old = this.byId.get(e);
        if (old) {
            this.byId.delete(e);
            this.byIdent.delete(old.ident);
        }
        if (!p || !p.ident || !p.valueType)
            return;
        const vt = VALUE_TYPE_IDENTS[p.valueType];
        if (vt === undefined)
            return;
        const unique = p.unique === ":db.unique/identity" ? "identity" : p.unique === ":db.unique/value" ? "value" : undefined;
        const attr = {
            id: e,
            ident: p.ident,
            valueType: vt,
            cardinality: p.cardinality === ":db.cardinality/many" ? "many" : "one",
            unique,
            index: !!p.index || unique !== undefined,
            isComponent: !!p.isComponent,
            doc: p.doc,
            optional: !!p.optional,
        };
        this.byId.set(e, attr);
        this.byIdent.set(attr.ident, attr);
    }
    attr(idOrIdent) {
        return typeof idOrIdent === "number" ? this.byId.get(idOrIdent) : this.byIdent.get(idOrIdent);
    }
    requireAttr(idOrIdent) {
        const a = this.attr(idOrIdent);
        if (!a)
            throw new Error(`unknown attribute ${String(idOrIdent)}`);
        return a;
    }
    entid(ident) {
        return this.idents.get(ident);
    }
    ident(e) {
        return this.identOf.get(e);
    }
    attributes() {
        return [...this.byId.values()];
    }
    isAvet(a) {
        const at = this.byId.get(a);
        return at !== undefined && at.index;
    }
    isVaet(a) {
        const at = this.byId.get(a);
        return at !== undefined && at.valueType === ValueTag.Ref;
    }
}
//# sourceMappingURL=schema.js.map