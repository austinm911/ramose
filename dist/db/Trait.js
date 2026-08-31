import { makeBindableTrait, } from "./Binding.js";
import { flattenTraitFields, mergeComposerFields, walkTraits, } from "./compose.js";
import { stamp, } from "./Entity.js";
import { attachAttrNav } from "./shapes.js";
import { DOCUMENTATION, normalizeDoc } from "./documentation.js";
import { invalidIdentName, isIdentName, isReservedFieldKey, reservedFieldName, } from "./IdentName.js";
import { bindOwnedOperations, OwnedOperations, ownedOperationAuthor, } from "./Operation.js";
const assertTraitName = (name) => {
    if (!isIdentName(name))
        throw invalidIdentName("trait", name);
};
const assertFieldKeys = (fields) => {
    for (const key of Object.keys(fields)) {
        if (isReservedFieldKey(key))
            throw reservedFieldName(key);
        if (!isIdentName(key))
            throw invalidIdentName("field", key);
    }
};
export function Trait(name, fields, options) {
    assertTraitName(name);
    assertFieldKeys(fields);
    const direct = (options?.traits ?? []);
    walkTraits(direct);
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
    const trait = {
        _tag: "Trait",
        ns: name,
        [DOCUMENTATION]: doc,
        fields: merged,
        traits: direct,
        id: idField,
        [OwnedOperations]: {},
        ...merged,
    };
    const operationAuthor = typeof options?.operations === "function"
        ? ownedOperationAuthor()
        : undefined;
    const operationSpecs = typeof options?.operations === "function"
        ? options.operations(operationAuthor)
        : options?.operations;
    trait[OwnedOperations] = bindOwnedOperations(trait, operationSpecs, operationAuthor);
    if (options?.bind !== undefined) {
        return makeBindableTrait(trait, options.bind);
    }
    return trait;
}
//# sourceMappingURL=Trait.js.map