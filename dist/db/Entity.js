import { flattenTraitFields, mergeComposerFields, walkTraits, } from "./compose.js";
import { COMPOSED_TRAITS } from "./Composer.js";
import { invalidIdentName, isIdentName, isReservedFieldKey, reservedFieldName, } from "./IdentName.js";
import { attachAttrNav, cardsOf, pathOf, revsOf, } from "./shapes.js";
import { bindOwnedOperations, OwnedOperations, ownedOperationAuthor, } from "./Operation.js";
import { DOCUMENTATION, normalizeDoc } from "./documentation.js";
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
export const stamp = (name, fields) => {
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
export function Entity(name, fields, options) {
    assertEntityName(name);
    assertFieldKeys(fields);
    const direct = (options?.traits ?? []);
    const traitClosure = walkTraits(direct).all;
    const stamped = stamp(name, fields);
    const flattened = flattenTraitFields(direct);
    const merged = mergeComposerFields(stamped, flattened);
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
        default: undefined,
        attrName: "id",
        ident: ":db/id",
    });
    const doc = normalizeDoc(options?.doc);
    const entity = {
        _tag: "Entity",
        ns: name,
        [DOCUMENTATION]: doc,
        fields: merged,
        traits: direct,
        [COMPOSED_TRAITS]: Object.fromEntries(traitClosure.map((trait) => [trait.ns, true])),
        [OwnedOperations]: {},
        id: idField,
        ...merged,
    };
    const operationAuthor = typeof options?.operations === "function"
        ? ownedOperationAuthor()
        : undefined;
    const operationSpecs = typeof options?.operations === "function"
        ? options.operations(operationAuthor)
        : options?.operations;
    entity[OwnedOperations] = bindOwnedOperations(entity, operationSpecs, operationAuthor);
    return entity;
}
//# sourceMappingURL=Entity.js.map