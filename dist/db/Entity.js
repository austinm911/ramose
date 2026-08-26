/** Named group of fields. `User.name` is the stamped field ref (`:user/name`). */
import { invalidIdentName, isIdentName, isReservedFieldKey, reservedFieldName, } from "./IdentName.js";
import { attachAttrNav, cardsOf, pathOf, revsOf, } from "./shapes.js";
/**
 * `field.reverse` — the same ref hop, read backwards: a shape node for
 * backlink selects. The hop's cardinality is the backlink's: many for an
 * ordinary ref (any number of entities may point at one), **one** for an
 * owned ref — the owned record is owned by its referrer, so at most
 * one entity points at it, and the server answers that backlink with a single
 * value.
 */
const reverseNode = (from) => {
    const card = from.owned === true ? "one" : "many";
    const path = pathOf(from);
    const cards = [...cardsOf(from)];
    const revs = [...revsOf(from)];
    cards[cards.length - 1] = card;
    revs[revs.length - 1] = true;
    return attachAttrNav({
        ...from,
        ident: from.ident,
        cardinality: card,
        __path: path,
        __cards: cards,
        __revs: revs,
        __reverse: true,
    });
};
const stampOne = (ns, key, a) => {
    const base = {
        ...a,
        attrName: key,
        ident: `:${ns}/${key}`,
    };
    const navigable = attachAttrNav(base);
    if (a.valueType !== "ref") {
        return navigable;
    }
    return new Proxy(navigable, {
        get(target, prop, receiver) {
            if (prop === "reverse")
                return reverseNode(receiver);
            return Reflect.get(target, prop, receiver);
        },
    });
};
const stamp = (name, fields) => {
    const out = {};
    for (const key of Object.keys(fields)) {
        out[key] = stampOne(name, key, fields[key]);
    }
    return out;
};
const assertEntityName = (name) => {
    if (!isIdentName(name))
        throw invalidIdentName("entity", name);
};
const assertFieldKeys = (fields) => {
    for (const key of Object.keys(fields)) {
        if (isReservedFieldKey(key))
            throw reservedFieldName(key);
        if (!isIdentName(key))
            throw invalidIdentName("field", key);
    }
};
/** Group fields under one ident prefix. */
export const Entity = (name, fields) => {
    assertEntityName(name);
    assertFieldKeys(fields);
    const stamped = stamp(name, fields);
    const idField = attachAttrNav({
        _tag: "Field",
        schema: null,
        cardinality: "one",
        unique: undefined,
        index: false,
        owned: false,
        doc: undefined,
        valueType: "ref",
        isOptional: false,
        attrName: "id",
        ident: ":db/id",
    });
    return {
        _tag: "Entity",
        ns: name,
        fields: stamped,
        id: idField,
        ...stamped,
    };
};
//# sourceMappingURL=Entity.js.map