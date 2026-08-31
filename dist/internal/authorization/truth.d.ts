import type { IncompleteReason } from "./failures.ts";
export type True = {
    readonly _tag: "True";
};
export type False = {
    readonly _tag: "False";
};
export type Incomplete = {
    readonly _tag: "Incomplete";
    readonly reason: IncompleteReason;
};
export type Truth = True | False | Incomplete;
export declare const True: True;
export declare const False: False;
export declare const Incomplete: (reason: IncompleteReason) => Incomplete;
export type ProjectedScalar = string | number | boolean | null;
export type ProjectedAtom = string | number | boolean | Date | Uint8Array;
export type ProjectedValue = ProjectedAtom | readonly ProjectedAtom[];
export type Present<T = ProjectedValue> = [undefined] extends [T] ? never : {
    readonly _tag: "Present";
    readonly value: T;
};
export type FieldAbsent = {
    readonly _tag: "FieldAbsent";
};
export type EntityAbsent = {
    readonly _tag: "EntityAbsent";
};
export type NotLoadedProjection = {
    readonly _tag: "NotLoaded";
};
export type InvalidTraversalProjection = {
    readonly _tag: "InvalidTraversal";
};
export type BudgetExhaustedProjection = {
    readonly _tag: "BudgetExhausted";
};
export type MissingMeProjection = {
    readonly _tag: "MissingMe";
};
export type Projected<T = ProjectedValue> = Present<T> | FieldAbsent | EntityAbsent | NotLoadedProjection | InvalidTraversalProjection | BudgetExhaustedProjection | MissingMeProjection;
export type CompleteProjected<T = ProjectedValue> = Present<T> | FieldAbsent | EntityAbsent;
export type IncompleteProjected = NotLoadedProjection | InvalidTraversalProjection | BudgetExhaustedProjection | MissingMeProjection;
export declare const Present: <T = ProjectedValue>(value: [undefined] extends [T] ? never : T) => Present<T>;
export declare const FieldAbsent: FieldAbsent;
export declare const EntityAbsent: EntityAbsent;
export declare const NotLoadedProjection: NotLoadedProjection;
export declare const InvalidTraversalProjection: InvalidTraversalProjection;
export declare const BudgetExhaustedProjection: BudgetExhaustedProjection;
export declare const MissingMeProjection: MissingMeProjection;
//# sourceMappingURL=truth.d.ts.map