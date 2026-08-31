export type ComposerLike = {
    readonly ns: string;
    readonly fields: object;
    readonly traits?: readonly ComposerLike[];
};
export declare const traitsOf: (composer: unknown) => readonly ComposerLike[];
export declare const composerIdent: (ns: string) => `:${string}`;
export declare const fieldIdentOf: (field: {
    readonly ident?: unknown;
}, key: string) => string;
export declare const conflictingFieldName: (key: string, left: string, right: string) => Error;
export declare const traitCycle: (path: readonly string[]) => Error;
export declare const duplicateTraitName: (ns: string) => Error;
export declare const unboundTrait: (ns: string) => Error;
export declare const entityTraitNameClash: (ns: string) => Error;
export declare const walkTraits: (traits: readonly ComposerLike[] | undefined) => {
    readonly direct: readonly ComposerLike[];
    readonly all: readonly ComposerLike[];
};
export declare const mergeComposerFields: <F>(...maps: ReadonlyArray<Readonly<Record<string, F>>>) => Record<string, F>;
export declare const flattenTraitFields: <F>(traits: readonly ComposerLike[] | undefined) => Record<string, F>;
export declare const transitiveTraitIdents: (composer: ComposerLike) => readonly string[];
export declare const reachableTraits: (entities: Iterable<ComposerLike>) => ReadonlyMap<string, ComposerLike>;
export declare const assertUniqueIdents: (entities: Iterable<ComposerLike>) => void;
export declare const assertEntityTraitNames: (entityNss: Iterable<string>, traits: ReadonlyMap<string, ComposerLike>) => void;
//# sourceMappingURL=compose.d.ts.map