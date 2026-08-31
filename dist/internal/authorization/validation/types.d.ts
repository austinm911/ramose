import * as Result from "effect/Result";
import type { FieldCardinality, FieldRefTarget, ScalarValueType } from "../catalog.ts";
import type { EntityId, OwnerRef } from "../identities.ts";
import type { ClaimShape } from "../principal.ts";
import { type ValidateFailure } from "./common.ts";
import { type PreparedAuthorizationCatalog, type RowFocus } from "./catalog.ts";
export type { RowFocus };
export type TermShape = {
    readonly _tag: "subject";
} | {
    readonly _tag: "scalar";
    readonly valueType: ScalarValueType | "null" | "number";
} | {
    readonly _tag: "row";
    readonly focus: RowFocus;
} | {
    readonly _tag: "me";
    readonly entity: EntityId | undefined;
} | {
    readonly _tag: "ref";
    readonly target: FieldRefTarget;
    readonly cardinality: FieldCardinality;
} | {
    readonly _tag: "claim";
    readonly shape: ClaimShape;
} | {
    readonly _tag: "collection";
    readonly element: TermShape;
};
export type Derived = {
    usesResource: boolean;
    usesMe: boolean;
    usesSubject: boolean;
    traversalDepth: number;
    staticWork: number;
};
export declare const emptyDerived: () => Derived;
export declare const mergeDerived: (into: Derived, part: Derived) => void;
export type StaticWork = {
    count: number;
};
export declare const takeWork: (spent: StaticWork, nodes: number, maxStaticWork: number) => Result.Result<void, ValidateFailure>;
export declare const charge: (derived: Derived, spent: StaticWork, nodes: number, maxStaticWork: number) => Result.Result<void, ValidateFailure>;
export declare const rowFromRefTarget: (index: PreparedAuthorizationCatalog, target: FieldRefTarget, owner: OwnerRef) => Result.Result<RowFocus | undefined, ValidateFailure>;
export declare const refTargetAsFocus: (target: FieldRefTarget) => RowFocus | undefined;
export declare const resolveRefTarget: (index: PreparedAuthorizationCatalog, target: FieldRefTarget, owner: OwnerRef) => Result.Result<FieldRefTarget, ValidateFailure>;
export declare const refCompatibleWithRow: (index: PreparedAuthorizationCatalog, target: FieldRefTarget, row: RowFocus) => boolean;
export declare const sameRefTarget: (index: PreparedAuthorizationCatalog, left: FieldRefTarget, right: FieldRefTarget) => boolean;
export declare const claimScalar: (shape: ClaimShape) => ScalarValueType | undefined;
export declare const litScalar: (value: string | number | boolean | null) => TermShape;
export declare const scalarAssignable: (expected: ScalarValueType | "null" | "number", actual: TermShape) => boolean;
export declare const meCompatibleWith: (index: PreparedAuthorizationCatalog, me: EntityId | undefined, other: TermShape) => boolean;
export declare const eqCompatible: (index: PreparedAuthorizationCatalog, left: TermShape, right: TermShape) => boolean;
export declare const collectionElement: (shape: TermShape) => Result.Result<TermShape | undefined, ValidateFailure>;
//# sourceMappingURL=types.d.ts.map