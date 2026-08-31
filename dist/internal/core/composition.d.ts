export type CompositionTables = {
    readonly entities: Iterable<string>;
    readonly traits: Iterable<string>;
    readonly entityTraits: Iterable<readonly [string, Iterable<string>]>;
    readonly traitTraits?: Iterable<readonly [string, Iterable<string>]>;
};
export type CompositionIndex = {
    readonly isEntityIdent: (ident: string) => boolean;
    readonly isTraitIdent: (ident: string) => boolean;
    readonly transitiveTraits: (ident: string) => readonly string[];
};
export declare const makeCompositionIndex: (tables: CompositionTables) => CompositionIndex;
//# sourceMappingURL=composition.d.ts.map