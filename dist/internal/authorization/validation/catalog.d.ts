import * as Result from "effect/Result";
import type { CatalogDescriptor, FieldDescriptor, OperationDescriptor } from "../catalog.ts";
import type { EntityId, FieldId, OperationId, OwnerRef, TraitId } from "../identities.ts";
import type { CatalogBindingTarget } from "../ir.ts";
import { type ValidateFailure } from "./common.ts";
export type RowFocus = {
    readonly _tag: "entity";
    readonly entity: EntityId;
} | {
    readonly _tag: "trait";
    readonly trait: TraitId;
};
export type PreparedAuthorizationCatalog = {
    readonly target: CatalogBindingTarget;
    readonly entities: ReadonlyMap<string, EntityId>;
    readonly traits: ReadonlyMap<string, TraitId>;
    readonly fields: ReadonlyMap<string, FieldDescriptor>;
    readonly operations: ReadonlyMap<string, OperationDescriptor>;
    readonly entityTraits: ReadonlyMap<string, ReadonlySet<string>>;
    readonly traitTraits: ReadonlyMap<string, ReadonlySet<string>>;
};
export declare const prepareAuthorizationCatalog: (target: CatalogBindingTarget, descriptor: CatalogDescriptor) => Result.Result<PreparedAuthorizationCatalog, ValidateFailure>;
export declare const requireEntity: (index: PreparedAuthorizationCatalog, id: EntityId, label: string) => Result.Result<EntityId, ValidateFailure>;
export declare const requireTrait: (index: PreparedAuthorizationCatalog, id: TraitId, label: string) => Result.Result<TraitId, ValidateFailure>;
export declare const requireField: (index: PreparedAuthorizationCatalog, id: FieldId, label: string) => Result.Result<FieldDescriptor, ValidateFailure>;
export declare const requireOperation: (index: PreparedAuthorizationCatalog, id: OperationId, label: string) => Result.Result<OperationDescriptor, ValidateFailure>;
export declare const entityComposes: (index: PreparedAuthorizationCatalog, entity: EntityId, traitName: string) => boolean;
export declare const traitComposes: (index: PreparedAuthorizationCatalog, trait: TraitId, otherName: string) => boolean;
export declare const fieldAccessibleFrom: (index: PreparedAuthorizationCatalog, focus: RowFocus, field: FieldDescriptor) => boolean;
export declare const ownerFocus: (index: PreparedAuthorizationCatalog, owner: OwnerRef) => Result.Result<RowFocus, ValidateFailure>;
export declare const sameRow: (index: PreparedAuthorizationCatalog, left: RowFocus, right: RowFocus) => boolean;
//# sourceMappingURL=catalog.d.ts.map