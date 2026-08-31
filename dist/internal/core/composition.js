const asIdent = (nameOrIdent) => nameOrIdent.startsWith(":") ? nameOrIdent : `:${nameOrIdent}`;
const freezeIdents = (values) => {
    const out = new Set();
    for (const value of values) {
        if (value.length === 0)
            continue;
        out.add(asIdent(value));
    }
    return out;
};
const freezeTraitMap = (rows) => {
    const out = new Map();
    if (rows === undefined)
        return out;
    for (const [composer, traits] of rows) {
        const ident = asIdent(composer);
        const seen = new Set();
        const list = [];
        for (const trait of traits) {
            const next = asIdent(trait);
            if (seen.has(next))
                continue;
            seen.add(next);
            list.push(next);
        }
        list.sort();
        out.set(ident, Object.freeze(list));
    }
    return out;
};
export const makeCompositionIndex = (tables) => {
    const entities = freezeIdents(tables.entities);
    const traits = freezeIdents(tables.traits);
    const entityTraits = freezeTraitMap(tables.entityTraits);
    const traitTraits = freezeTraitMap(tables.traitTraits);
    const transitiveTraits = (ident) => {
        const key = asIdent(ident);
        return entityTraits.get(key) ?? traitTraits.get(key) ?? [];
    };
    return Object.freeze({
        isEntityIdent: (ident) => entities.has(asIdent(ident)),
        isTraitIdent: (ident) => traits.has(asIdent(ident)),
        transitiveTraits,
    });
};
//# sourceMappingURL=composition.js.map