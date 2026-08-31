import { conflictingIdent } from "./IdentName.js";
import { isBindableTrait, traitDefinitionOf, } from "./Binding.js";
export const traitsOf = (composer) => {
    if ((typeof composer !== "object" && typeof composer !== "function") ||
        composer === null)
        return [];
    const traits = composer.traits;
    return Array.isArray(traits) ? traits : [];
};
export const composerIdent = (ns) => `:${ns}`;
export const fieldIdentOf = (field, key) => (typeof field.ident === "string" ? field.ident : key);
export const conflictingFieldName = (key, left, right) => new Error(`ramose/schema: conflicting field ${JSON.stringify(key)} — ${left} vs ${right}`);
export const traitCycle = (path) => new Error(`ramose/schema: trait cycle: ${path.join(" → ")}`);
export const duplicateTraitName = (ns) => new Error(`ramose/schema: duplicate trait name ${JSON.stringify(ns)}`);
export const unboundTrait = (ns) => new Error(`ramose/schema: bindable trait ${JSON.stringify(ns)} must be called with a code definition before composition`);
export const entityTraitNameClash = (ns) => new Error(`ramose/schema: ${JSON.stringify(ns)} is both an entity and a trait`);
export const walkTraits = (traits) => {
    const direct = traits ?? [];
    const all = [];
    const seen = new Set();
    const stack = [];
    const visit = (input) => {
        if (isBindableTrait(input))
            throw unboundTrait(input.ns);
        const trait = traitDefinitionOf(input);
        if (stack.includes(trait)) {
            throw traitCycle([...stack, trait].map((t) => t.ns));
        }
        if (seen.has(trait))
            return;
        stack.push(trait);
        for (const inner of traitsOf(trait))
            visit(inner);
        stack.pop();
        seen.add(trait);
        all.push(trait);
    };
    for (const trait of direct)
        visit(trait);
    return { direct, all };
};
export const mergeComposerFields = (...maps) => {
    const out = {};
    for (const map of maps) {
        for (const [key, field] of Object.entries(map)) {
            const existing = out[key];
            if (existing !== undefined && existing !== field) {
                throw conflictingFieldName(key, fieldIdentOf(existing, key), fieldIdentOf(field, key));
            }
            out[key] = field;
        }
    }
    return out;
};
export const flattenTraitFields = (traits) => {
    const { all } = walkTraits(traits);
    return mergeComposerFields(...all.map((trait) => trait.fields));
};
export const transitiveTraitIdents = (composer) => {
    const { all } = walkTraits(traitsOf(composer));
    const seen = new Set();
    const out = [];
    for (const trait of all) {
        const ident = composerIdent(trait.ns);
        if (seen.has(ident))
            continue;
        seen.add(ident);
        out.push(ident);
    }
    return out;
};
export const reachableTraits = (entities) => {
    const byNs = new Map();
    for (const entity of entities) {
        const { all } = walkTraits(traitsOf(entity));
        for (const trait of all) {
            const stable = traitDefinitionOf(trait);
            const seen = byNs.get(stable.ns);
            if (seen !== undefined && seen !== stable) {
                throw duplicateTraitName(stable.ns);
            }
            byNs.set(stable.ns, stable);
        }
    }
    return byNs;
};
export const assertUniqueIdents = (entities) => {
    const seen = new Map();
    for (const entity of entities) {
        for (const [key, field] of Object.entries(entity.fields)) {
            const ident = fieldIdentOf(field, key);
            const prev = seen.get(ident);
            if (prev !== undefined && prev !== field)
                throw conflictingIdent(ident);
            seen.set(ident, field);
        }
    }
};
export const assertEntityTraitNames = (entityNss, traits) => {
    for (const ns of entityNss) {
        if (traits.has(ns))
            throw entityTraitNameClash(ns);
    }
};
//# sourceMappingURL=compose.js.map